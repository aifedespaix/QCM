export { SUBJECT_TONES } from '@qcm/ui'

export function questionCountLabel(count: number): string {
  return count === 1 ? '1 question' : `${count} questions`
}
