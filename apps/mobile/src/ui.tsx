import type { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from "react-native";
export const styles = StyleSheet.create({
  page: { padding: 24, gap: 16, backgroundColor: "#f5f8f7", flexGrow: 1 },
  title: { fontSize: 27, fontWeight: "700", color: "#102c29" },
  text: { fontSize: 16, lineHeight: 24, color: "#34504a" },
  error: { color: "#a32323", fontSize: 15 },
  input: {
    borderWidth: 1,
    borderColor: "#97aaa4",
    borderRadius: 10,
    padding: 14,
    backgroundColor: "white",
    fontSize: 17,
  },
  button: { padding: 16, borderRadius: 10, backgroundColor: "#146b58" },
  buttonText: { color: "white", fontSize: 16, fontWeight: "600" },
  card: { padding: 18, borderRadius: 12, backgroundColor: "white", gap: 8 },
  muted: { fontSize: 13, color: "#64756f" },
});
export function Page({ children }: PropsWithChildren) {
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}
export function Title({ children }: PropsWithChildren) {
  return <Text style={styles.title}>{children}</Text>;
}
export function Copy({ children }: PropsWithChildren) {
  return <Text style={styles.text}>{children}</Text>;
}
export function Button({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && { opacity: 0.5 }]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}
export function Field({
  value,
  onChangeText,
  label,
  numeric,
}: {
  value: string;
  onChangeText: (value: string) => void;
  label: string;
  numeric?: boolean;
}) {
  return (
    <TextInput
      accessibilityLabel={label}
      placeholder={label}
      value={value}
      onChangeText={onChangeText}
      keyboardType={numeric ? "phone-pad" : "default"}
      autoCapitalize="none"
      style={styles.input}
    />
  );
}
export function Feedback({
  loading,
  error,
}: {
  loading?: boolean;
  error?: Error | null;
}) {
  return (
    <>
      {loading && <ActivityIndicator accessibilityLabel="Loading" />}
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error.message}
        </Text>
      )}
    </>
  );
}
