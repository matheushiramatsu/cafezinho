import { useState, type CSSProperties } from 'react'
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react'
import type { ThemePreference } from '../domain/storage'
import Icon from './Icon'
import ThemeToggle from './ThemeToggle'

interface Props {
  theme: Exclude<ThemePreference, 'system'>
  onThemeChange: (theme: Exclude<ThemePreference, 'system'>) => void
}

export default function Navbar({ theme, onThemeChange }: Props) {
  const [compact, setCompact] = useState(() => window.scrollY > 64)
  const { scrollY } = useScroll()
  const reducedMotion = useReducedMotion()
  const transition = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 320, damping: 34, mass: 0.8 }

  useMotionValueEvent(scrollY, 'change', (position) => {
    // Limiares diferentes evitam alternar o tamanho com pequenas oscilações.
    setCompact((previous) => position > 64 || (previous && position > 24))
  })

  return (
    <div className="topbar-slot">
      <motion.header
        className="topbar"
        data-compact={compact}
        initial={false}
        style={{ '--nav-expand': compact ? 0 : 1 } as CSSProperties}
        animate={{
          '--nav-expand': compact ? 0 : 1,
          boxShadow: compact
            ? '0px 8px 28px rgba(0, 12, 80, 0.14)'
            : '0px 0px 0px rgba(0, 12, 80, 0)',
        }}
        transition={transition}
      >
        <div className="topbar__inner">
          <motion.p className="brand" layout="position" transition={transition}>
            <span className="brand__mark"><Icon name="coffee" size={20} /></span>
            <span className="brand__name">Cafezinho</span>
          </motion.p>
          <motion.nav
            className="section-nav"
            aria-label="Seções do café"
            layout="position"
            transition={transition}
          >
            <a href="#organizar">Organizar</a>
            <a href="#resultado">Resultado</a>
            <a href="#historico">Histórico</a>
          </motion.nav>
          <motion.div className="topbar__theme" layout="position" transition={transition}>
            <ThemeToggle theme={theme} onChange={onThemeChange} />
            <button
              type="button"
              className="btn btn--ghost topbar__theme-toggle"
              aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
              title={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
              onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
            </button>
          </motion.div>
        </div>
      </motion.header>
    </div>
  )
}
