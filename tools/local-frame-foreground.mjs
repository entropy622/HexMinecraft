import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

// A focused web document can still be covered by another exclusive-fullscreen
// program. Check Windows independently throughout the benchmark.
export async function monitorForeground(pid) {
  if (process.platform !== 'win32')
    throw Error('The local hardware benchmark requires Windows.');
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ForegroundProbe {
  [StructLayout(LayoutKind.Sequential)] public struct Point {public int x,y;}
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point p);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static bool Visible(uint expected) {
    uint foreground, center;
    GetWindowThreadProcessId(GetForegroundWindow(), out foreground);
    GetWindowThreadProcessId(WindowFromPoint(new Point{x=1280,y=800}), out center);
    return foreground==expected && center==expected;
  }
}
"@
while ($true) {
  if ([ForegroundProbe]::Visible(${Number(pid)})) { [Console]::WriteLine('visible') } else { [Console]::WriteLine('covered') }
  Start-Sleep -Milliseconds 250
}`;
  const child = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let valid = true,
    samples = 0;
  const lines = createInterface({ input: child.stdout });
  const started = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(Error('Windows foreground monitor did not start')),
      20000,
    );
    lines.on('line', (line) => {
      if (!['visible', 'covered'].includes(line)) return;
      samples++;
      valid &&= line === 'visible';
      clearTimeout(timeout);
      resolve();
    });
    child.once('error', (e) => {
      valid = false;
      clearTimeout(timeout);
      reject(e);
    });
    child.once('exit', () => {
      valid = false;
      clearTimeout(timeout);
      reject(Error('Foreground monitor closed'));
    });
  });
  try {
    await started;
    if (!valid)
      throw Error(
        'The benchmark browser is covered. Foreground gameplay is required.',
      );
  } catch (error) {
    child.kill();
    throw error;
  }
  return {
    get valid() {
      return valid && samples > 0;
    },
    stop() {
      child.kill();
      lines.close();
    },
  };
}
