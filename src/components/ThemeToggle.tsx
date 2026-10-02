import type { ThemePreference } from '../domain/storage'
import Icon, { type IconName } from './Icon'

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: IconName }> = [
  { value: 'system', label: 'Sistema', icon: 'monitor' },
  { value: 'light', label: 'Claro', icon: 'sun' },
  { value: 'dark', label: 'Escuro', icon: 'moon' },
]

interface Props {
  theme: ThemePreference
  onChange: (theme: ThemePreference) => void
}

export default function ThemeToggle({ theme, onChange }: Props) {
  return (
    <div className="segmented" role="group" aria-label="Tema da interface">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segmented__button"
          aria-pressed={theme === option.value}
          aria-label={option.label}
          title={option.label}
          onClick={() => onChange(option.value)}
        >
          <Icon name={option.icon} size={16} />
          <span className="segmented__label">{option.label}</span>
        </button>
      ))}
    </div>
  )
}
