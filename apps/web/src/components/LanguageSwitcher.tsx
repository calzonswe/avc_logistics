// Language switcher (ticket 16) — Swedish is the primary language.
import { useTranslation } from 'react-i18next';
import { setLanguage, LANGUAGES } from '../i18n';
import { Select } from '@avc/ui/components/Select';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  return (
    <Select
      value={i18n.language?.slice(0, 2) || 'sv'}
      onChange={(e) => setLanguage(e.target.value)}
      options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
      className="w-32"
      aria-label={t('common.language')}
    />
  );
}
