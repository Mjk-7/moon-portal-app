import { type ComponentRef, type ReactNode, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Rect = { x: number; y: number; width: number; height: number };

/**
 * Where a dropdown's button is on screen, so its menu opens right under it:
 * pass `anchor` as the button's ref and call `open` from its press.
 */
export function useAnchor() {
  const [node, anchor] = useState<ComponentRef<typeof View> | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const open = () => node?.measureInWindow((x, y, width, height) => setRect({ x, y, width, height }));
  const close = () => setRect(null);
  return { anchor, rect, open, close };
}

/**
 * A small menu that drops from a button (above it when there is no room
 * below), closed by a tap anywhere else.
 */
export function Popover({
  rect,
  onClose,
  width = 260,
  children,
}: {
  rect: Rect | null;
  onClose: () => void;
  width?: number;
  children: ReactNode;
}) {
  const theme = useTheme();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);
  if (!rect) return null;
  const left = Math.max(Spacing.three, Math.min(rect.x, window.width - width - Spacing.three));
  const below = rect.y + rect.height + 6;
  const room = window.height - insets.bottom - Spacing.two;
  const top = !height || below + height <= room ? below : Math.max(insets.top + Spacing.two, rect.y - 6 - height);
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close the menu" />
      <View
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
        style={[
          styles.menu,
          {
            top,
            left,
            width,
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
            // Placed once its height is known, so it never flashes off screen.
            opacity: height ? 1 : 0,
          },
        ]}>
        {children}
      </View>
    </Modal>
  );
}

/** One line of a popover menu, ticked when it is the current choice. */
export function MenuItem({
  label,
  hint,
  leading,
  selected,
  danger,
  onPress,
}: {
  label: string;
  hint?: string;
  leading?: ReactNode;
  selected?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: theme.backgroundSelected }]}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.flex}>
        <ThemedText type={selected ? 'smallBold' : 'small'} themeColor={danger ? 'danger' : 'text'}>
          {label}
        </ThemedText>
        {hint ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint} numberOfLines={1}>
            {hint}
          </ThemedText>
        ) : null}
      </View>
      {selected ? <Icon name="check" size={14} color={theme.text} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  menu: {
    position: 'absolute',
    paddingVertical: Spacing.one,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 44,
  },
  leading: { width: 18, alignItems: 'center' },
  hint: { fontSize: 12, lineHeight: 15 },
});
