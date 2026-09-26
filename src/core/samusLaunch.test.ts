import { describe, expect, it } from 'vitest';
import { DEFAULT_SAMUS_CFG_TEXT, parseSamusArgs, parseSamusConfig } from './samusLaunch';

describe('parseSamusConfig', () => {
  it('parses the default file to the defaults', () => {
    expect(parseSamusConfig(DEFAULT_SAMUS_CFG_TEXT)).toEqual({
      unlock_slots: 12,
      difficulty: 'normal',
      starting_energy: 30,
      sound: true,
    });
  });

  it('keeps unknown keys and ignores bad numbers', () => {
    const cfg = parseSamusConfig('unlock_slots=banana\nsound=off\nfoo = bar # c\n');
    expect(cfg.unlock_slots).toBe(12);
    expect(cfg.sound).toBe(false);
    expect(cfg.foo).toBe('bar');
  });
});

describe('parseSamusArgs', () => {
  const cfg = parseSamusConfig('');
  it('handles inline and separate values', () => {
    const p = parseSamusArgs(['--debug', '--password=NARPAS SWORD', '--level', '-1'], cfg);
    expect(p.launch.debug).toBe(true);
    expect(p.launch.password).toBe('NARPAS SWORD');
    expect(p.launch.level).toBe(-1);
    expect(p.unknown).toEqual([]);
  });

  it('reports unknown flags and special flags', () => {
    const p = parseSamusArgs(['--unlock-all', '--fly', '-h'], cfg);
    expect(p.unlockAll).toBe(true);
    expect(p.help).toBe(true);
    expect(p.unknown).toEqual(['--fly']);
  });
});
