import type { ThemePreference } from '../domain/storage'
import Icon, { type IconName } from './Icon'

type ManualTheme = Exclude<ThemePreference, 'system'>

const OPTIONS: Array<{ value: ManualTheme; label: string; icon: IconName }> = [
  { value: 'light', label: 'Claro', icon: 'sun' },
  { value: 'dark', label: 'Escuro', icon: 'moon' },
]

interface Props {
  theme: ManualTheme
  onChange: (theme: ManualTheme) => void
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
        </button>
      ))}
    </div>
  )
}
