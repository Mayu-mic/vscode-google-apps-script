export interface GoogleAppsScriptProject {
  name: string;
  id: string;
  url: string;
}

export type GoogleAppsScriptDeployment =
  | GoogleAppsScriptNonDeployment
  | GoogleAppsScriptHeadDeployment;

export interface GoogleAppsScriptNonDeployment {
  id: string;
  projectId: string;
  description: string | undefined;
  versionIdentity: `@${string}`;
  versionNumber: number;
}

export interface GoogleAppsScriptHeadDeployment {
  id: string;
  projectId: string;
  versionIdentity: '@HEAD';
}

export interface GoogleAppsScriptVersion {
  projectId: string;
  description: string | undefined;
  versionNumber: number;
}

export function isHeadDeployment(
  deployment: GoogleAppsScriptHeadDeployment | GoogleAppsScriptNonDeployment
): deployment is GoogleAppsScriptHeadDeployment {
  return deployment.versionIdentity === '@HEAD';
}
