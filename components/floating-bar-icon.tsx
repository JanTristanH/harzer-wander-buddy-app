import { Ionicons } from '@expo/vector-icons';

type FloatingBarIconName = 'index' | 'friends' | 'profile';

const ICONS: Record<FloatingBarIconName, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  index: {
    active: 'list',
    inactive: 'list-outline',
  },
  friends: {
    active: 'people',
    inactive: 'people-outline',
  },
  profile: {
    active: 'person',
    inactive: 'person-outline',
  },
};

export function FloatingBarIcon({
  name,
  focused,
  color,
  size = 26,
}: {
  name: FloatingBarIconName;
  focused: boolean;
  color: string;
  size?: number;
}) {
  const iconName = focused ? ICONS[name].active : ICONS[name].inactive;

  return <Ionicons color={color} name={iconName} size={size} />;
}
