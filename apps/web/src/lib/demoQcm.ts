import { validateQcm } from '@qcm/core'

/** Petit QCM de démonstration joué sur la page d'accueil (aucune requête réseau). */
export const DEMO_QCM = validateQcm({
  version: 1,
  meta: {
    title: 'Les fractions : comparer et simplifier',
    subject: 'maths',
    level: '6e',
    chapter: 'Chapitre 4 — Fractions',
    language: 'fr',
    description: 'Trois questions pour découvrir comment fonctionne un QCM.',
  },
  questions: [
    {
      id: 'q1',
      prompt: 'Quelle fraction est égale à 1/2 ?',
      choices: [{ text: '2/4', correct: true }, { text: '1/3' }, { text: '3/4' }, { text: '2/3' }],
      hint: 'Multiplie le haut et le bas de 1/2 par le même nombre.',
      explanation: '1/2 = 2/4, car 1 × 2 = 2 et 2 × 2 = 4.',
    },
    {
      id: 'q2',
      prompt: 'Dans la fraction 3/5, comment s\'appelle le nombre 5 ?',
      choices: [{ text: 'Le numérateur' }, { text: 'Le dénominateur', correct: true }],
      hint: 'C\'est le nombre écrit en bas.',
      explanation: 'Le nombre du bas s\'appelle le dénominateur. Il indique en combien de parts égales on partage.',
    },
    {
      id: 'q3',
      prompt: 'Quelle est la forme simplifiée de 6/8 ?',
      choices: [{ text: '2/3' }, { text: '3/4', correct: true }, { text: '6/4' }, { text: '1/2' }],
      hint: 'Divise le haut et le bas par 2.',
      explanation: '6 ÷ 2 = 3 et 8 ÷ 2 = 4. Donc 6/8 = 3/4.',
    },
  ],
})
