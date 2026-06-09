// One-shot transformer from state schema v1 → v2.
// Pure function: returns a new object, does not mutate input.

const PHASE_MAP: Record<string, string> = {
  'plan-approval': 'plan-ack',
  'implement': 'plan-ack',
};

const STATUS_MAP: Record<string, string> = {
  proposed: 'pending',
  approved: 'pending',
  rejected: 'wontdo',
  dropped: 'wontdo',
  shipped: 'shipped',
};

export function migrateV1ToV2(v1: any): any {
  const remappedPhase = PHASE_MAP[v1.currentPhase] ?? v1.currentPhase;
  const remappedRounds: Record<string, any> = {};
  for (const [k, round] of Object.entries(v1.rounds as Record<string, any>)) {
    remappedRounds[k] = {
      ...round,
      plan: (round.plan ?? []).map((item: any) => ({
        ...item,
        status: STATUS_MAP[item.status] ?? item.status,
      })),
    };
  }
  return {
    ...v1,
    schemaVersion: 2,
    currentPhase: remappedPhase,
    rounds: remappedRounds,
  };
}
