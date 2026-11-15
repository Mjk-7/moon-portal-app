import { api } from './api';
import { queryClient } from './query';
import type { ProjectDetail, ProjectPage } from './types';

/*
 * A project page's data, shared by the page and whatever opens it, so a tap
 * can start the loading before the page is on screen.
 */

export const projectQuery = (id: string) => ({
  queryKey: ['project', id],
  queryFn: () => api<ProjectDetail>(`/api/projects/${id}`),
});

export const projectPagesQuery = (id: string) => ({
  queryKey: ['project', id, 'pages'],
  queryFn: () =>
    api<{ objective: ProjectPage | null; pages: ProjectPage[] }>(`/api/projects/${id}/pages`),
});

/** Starts loading a project's page (no-op when it is fresh in the cache). */
export function prefetchProject(id: string) {
  void queryClient.prefetchQuery(projectQuery(id));
}
