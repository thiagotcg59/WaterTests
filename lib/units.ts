export const LPS_TO_M3H = 3.6;

export function flowToM3h(flowLps?: number): number | undefined {
  if (flowLps === undefined || flowLps === null || Number.isNaN(flowLps)) return undefined;
  return Math.abs(flowLps) * LPS_TO_M3H;
}
