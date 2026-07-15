import { describe, it, expect } from 'vitest';
import { parsePort, chromeLaunchSpec } from '../src/cdp.js';

describe('parsePort', () => {
  it('defaults to 9222 when undefined', () => {
    expect(parsePort(undefined)).toBe(9222);
  });
  it('reads the port from an endpoint', () => {
    expect(parsePort('http://localhost:9333')).toBe(9333);
  });
  it('defaults to 9222 when the endpoint has no port', () => {
    expect(parsePort('http://localhost')).toBe(9222);
  });
  it('defaults to 9222 on a malformed endpoint', () => {
    expect(parsePort('not a url')).toBe(9222);
  });
});

describe('chromeLaunchSpec', () => {
  it('resolves macOS binary and profile', () => {
    const spec = chromeLaunchSpec('darwin', '/Users/x');
    expect(spec.bin).toMatch(/Google Chrome$/);
    expect(spec.profileDir).toBe('/Users/x/Library/Application Support/Google/Chrome');
  });
  it('resolves linux binary and profile', () => {
    const spec = chromeLaunchSpec('linux', '/home/x');
    expect(spec.profileDir).toBe('/home/x/.config/google-chrome');
  });
  it('throws with a pointer to the manual command on unsupported platforms', () => {
    expect(() => chromeLaunchSpec('win32', 'C:\\Users\\x')).toThrow(/README/);
  });
});
