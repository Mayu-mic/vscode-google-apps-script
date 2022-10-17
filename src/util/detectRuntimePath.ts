import { Uri, window, workspace } from 'vscode';
import {} from 'os';
import { resolve } from 'path';

export async function detectRuntimePath(
  command: string,
  tmpUri: Uri,
  timeout = 2000
): Promise<string | null> {
  const runtimeTmpFile = resolve(tmpUri.path, `.${command}-runtime`);

  try {
    await new Promise<void>(async (resolve) => {
      window.onDidCloseTerminal(
        (e) => e.processId === terminal.processId && resolve()
      );
      setTimeout(() => resolve(), timeout);
      const terminal = window.createTerminal({
        name: `detect ${command} path`,
      });
      terminal.sendText(`which '${command}' > '${runtimeTmpFile}' && exit`);
    });
    return new Promise<string | null>((resolve) =>
      workspace.fs.readFile(Uri.file(runtimeTmpFile)).then((buf) => {
        resolve(buf.toString().trim());
      })
    );
  } catch (error) {
    return null;
  }
}
