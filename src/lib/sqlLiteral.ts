export function sqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}
