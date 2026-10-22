import { isDeepStrictEqual } from 'node:util'
import { parse } from 'yaml'
import { parseProfileFit } from './profileFit'
import { checkContent } from './validate'
import { fitBasisFields, readWorkspace, updateWorkspace, workspaceInputs, WorkspaceRevisionConflict, type ApplicationWorkspace } from './workspaces'

/**
 * Save the fit correction and its Skills edit together. A concurrent resume
 * autosave is safe for report-only turns, but cannot be overwritten by an AI edit.
 */
export async function saveAnalysisChatChanges(
  key: string, base: ApplicationWorkspace, value: unknown, originalYaml: string, nextYaml: string,
): Promise<{ analysisUpdated: boolean; draftUpdated: boolean }> {
  const analysisUpdated = JSON.stringify(value) !== JSON.stringify(base.fit.report)
  const draftUpdated = nextYaml !== originalYaml
  if (!analysisUpdated && !draftUpdated) return { analysisUpdated, draftUpdated }
  if (draftUpdated) {
    if (originalYaml !== base.draftYaml) throw new Error('The resume changed before this discussion. Wait for it to save, then retry.')
    if (base.pendingProposal) throw new Error('Accept or reject the pending resume change before updating Skills.')
    await validateSkillsEdit(originalYaml, nextYaml)
  }
  const inputs = await workspaceInputs(key)
  const { analysis } = inputs
  if (!analysis || !base.fit.report) throw new Error('Wait for the first fit analysis to finish, then retry your correction.')
  let report = base.fit.report
  if (analysisUpdated) {
    const rows = (value as { requirements?: unknown } | null)?.requirements
    if (!Array.isArray(rows) || rows.length !== analysis.requirements.length || rows.some((row, index) =>
      row?.requirement !== analysis.requirements[index].text || row?.weight !== analysis.requirements[index].weight || row?.rank !== analysis.requirements[index].rank,
    )) throw new Error('The analysis correction changed the job requirements. Your report was preserved; retry the correction.')
    report = parseProfileFit(value, analysis, `${inputs.masterYaml}\n${inputs.guidance}\n${nextYaml}`)
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await readWorkspace(key)
    if (JSON.stringify(current.fit.report) !== JSON.stringify(base.fit.report)) throw new Error('The fit analysis changed during this discussion. Retry against the updated analysis.')
    if (draftUpdated && current.draftYaml !== base.draftYaml) throw new Error('The application resume changed during this discussion. Retry against the current resume.')
    if (draftUpdated && current.pendingProposal) throw new Error('Accept or reject the pending resume change before updating Skills.')
    try {
      await updateWorkspace(key, current.revision, (latest) => ({
        ...latest,
        ...(draftUpdated ? { draftYaml: nextYaml } : {}),
        ...(analysisUpdated ? { fit: { ...latest.fit, ...fitBasisFields(inputs), status: 'ready' as const, report, error: null, completedAt: new Date().toISOString() } } : {}),
      }))
      return { analysisUpdated, draftUpdated }
    } catch (error) {
      if (!(error instanceof WorkspaceRevisionConflict) || attempt === 3) throw error
    }
  }
  return { analysisUpdated: false, draftUpdated: false }
}

/** Preserve existing tests and report-only callers. */
export async function saveAnalysisChatReport(key: string, base: ApplicationWorkspace, value: unknown): Promise<boolean> {
  return (await saveAnalysisChatChanges(key, base, value, base.draftYaml, base.draftYaml)).analysisUpdated
}

async function validateSkillsEdit(beforeText: string, afterText: string): Promise<void> {
  const checked = await checkContent(afterText, 'tailored')
  if (!checked.ok) throw new Error(`The Skills edit failed resume validation: ${checked.failures[0].why}`)
  const before = parse(beforeText) as { cv?: { sections?: Record<string, unknown> } }
  const after = structuredClone(checked.doc) as { cv?: { sections?: Record<string, unknown> } }
  const beforeSections = before?.cv?.sections
  const afterSections = after?.cv?.sections
  const skills = Object.keys(beforeSections ?? {}).find((name) => /^(Skills|Compétences|Competences)$/i.test(name))
  if (!skills || !Array.isArray(beforeSections?.[skills]) || !Array.isArray(afterSections?.[skills])) {
    throw new Error('The application resume has no editable Skills section.')
  }
  delete beforeSections[skills]
  delete afterSections[skills]
  if (!isDeepStrictEqual(before, after)) throw new Error('Fit chat may update only the existing Skills section of the application resume.')
}
