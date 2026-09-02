export function shouldBootstrapEquipment(existingCount: number): boolean {
  if (!Number.isSafeInteger(existingCount) || existingCount < 0) {
    throw new Error("equipment count must be a non-negative safe integer");
  }
  return existingCount === 0;
}