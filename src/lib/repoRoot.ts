import { resolve } from 'path'

/**
 * The .mjs engines resolve their own paths from __dirname (the repo root), so
 * the app must run with cwd = repo root for the two to agree.
 */
export const REPO_ROOT = process.cwd()

/**
 * The user's data: resumes, applications, state, personal config. It defaults
 * to workspace/ in the repo, which git ignores so the data can be its own
 * (private) repository. ONWARD_WORKSPACE points elsewhere, relative to the repo
 * root or absolute; tests point it at examples/workspace.
 */
export const WORKSPACE_ROOT = resolve(REPO_ROOT, process.env.ONWARD_WORKSPACE || 'workspace')

/** company name -> folder slug, matching the historical convention. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // drop parenthetical asides: "Xccelerated (part of Xebia)" -> "xccelerated"
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
