import { describe, expect, test } from 'bun:test'
import { defaultLibraryState, libraryHeading, libraryHref, parseLibraryParams } from '../src/lib/libraryQuery.ts'
import { parseQcmSlug, qcmPath, slugify } from '../src/lib/qcmUrl.ts'

describe('adresses des fiches', () => {
  test('titre lisible puis identifiant', () => {
    expect(qcmPath({ id: 'xpzr1irz48bg66y', title: "L'échauffement vocal : la voix !" })).toBe('/qcm/l-echauffement-vocal-la-voix-xpzr1irz48bg66y/')
    expect(qcmPath({ id: 'xpzr1irz48bg66y', title: 'Les fractions' }, { play: true })).toBe('/qcm/les-fractions-xpzr1irz48bg66y/?jouer=1')
  })

  test('sans titre exploitable : identifiant seul', () => {
    expect(qcmPath({ id: 'xpzr1irz48bg66y', title: '???' })).toBe('/qcm/xpzr1irz48bg66y/')
  })

  test('retrouve l\'identifiant', () => {
    expect(parseQcmSlug('les-fractions-xpzr1irz48bg66y')).toBe('xpzr1irz48bg66y')
    expect(parseQcmSlug('xpzr1irz48bg66y')).toBe('xpzr1irz48bg66y')
    expect(parseQcmSlug('les-fractionsxpzr1irz48bg66y')).toBeNull()
    expect(parseQcmSlug('court')).toBeNull()
    expect(parseQcmSlug(undefined)).toBeNull()
  })

  test('slug borné, sans tiret final', () => {
    const slug = slugify('a'.repeat(69) + ' b c')
    expect(slug.length).toBeLessThanOrEqual(70)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('adresse de la bibliothèque', () => {
  test('aller-retour', () => {
    const state = { ...defaultLibraryState(), search: 'atome', subject: 'svt' as const, level: '3e' as const, sort: 'rating' as const, page: 2 }
    const href = libraryHref(state)
    expect(href).toBe('/bibliotheque/?q=atome&matiere=svt&niveau=3e&tri=rating&page=2')
    expect(parseLibraryParams(new URL(href, 'http://x').searchParams)).toEqual(state)
  })

  test('valeurs inconnues ignorées', () => {
    expect(parseLibraryParams(new URLSearchParams('matiere=cuisine&niveau=master&tri=hasard&page=-3'))).toEqual(defaultLibraryState())
    expect(libraryHref(defaultLibraryState())).toBe('/bibliotheque/')
  })

  test('titre selon les filtres', () => {
    expect(libraryHeading('', '')).toBe('Bibliothèque')
    expect(libraryHeading('maths', '3e')).toBe('QCM de mathématiques, niveau 3e')
    expect(libraryHeading('svt', '')).toBe('QCM de SVT')
  })
})
