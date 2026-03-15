import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthGuard } from '@/components/auth-guard';
import { Fonts } from '@/constants/theme';
import {
  fetchCurrentUserProfile,
  updateCurrentUserProfile,
  uploadAttachment,
  type CurrentUserProfileData,
} from '@/lib/api';
import { useAuth, useIdTokenClaims } from '@/lib/auth';
import { buildAuthenticatedImageSource } from '@/lib/images';

type SelectedImage = {
  uri: string;
  fileName: string;
  mimeType: string;
};

type ProfileClaims = {
  sub?: string;
  name?: string;
  picture?: string;
};

function ProfileEditContent() {
  const router = useRouter();
  const { accessToken, logout } = useAuth();
  const claims = useIdTokenClaims<ProfileClaims>();
  const [profile, setProfile] = useState<CurrentUserProfileData | null>(null);
  const [name, setName] = useState('');
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);

    try {
      const nextProfile = await fetchCurrentUserProfile(accessToken);
      const resolvedProfile = {
        ...nextProfile,
        name: nextProfile.name || claims?.name || claims?.sub || nextProfile.id,
        picture: nextProfile.picture || claims?.picture,
      };
      setProfile(resolvedProfile);
      setName(resolvedProfile.name);
      setSelectedImage(null);
      setError(null);
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === 'UnauthorizedError') {
        await logout();
        return;
      }

      setError(nextError instanceof Error ? nextError.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, claims?.name, claims?.picture, claims?.sub, logout]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const previewImage = selectedImage?.uri || profile?.picture || claims?.picture;
  const trimmedName = name.trim();
  const hasChanges =
    !!profile &&
    (trimmedName !== (profile.name || '').trim() || Boolean(selectedImage));

  const helperText = useMemo(() => {
    if (selectedImage) {
      return 'Neues Profilbild ausgewaehlt. Es wird beim Speichern hochgeladen.';
    }

    return 'Du kannst deinen Anzeigenamen aendern und ein neues Profilbild aus deiner Mediathek hochladen.';
  }, [selectedImage]);

  const handlePickImage = useCallback(async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert(
        'Zugriff auf Fotos benoetigt',
        'Bitte erlaube den Zugriff auf deine Fotos, um ein Profilbild auszuwaehlen.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const asset = result.assets[0];
    setSelectedImage({
      uri: asset.uri,
      fileName: asset.fileName || `profile-${Date.now()}.jpg`,
      mimeType: asset.mimeType || 'image/jpeg',
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!accessToken || !profile) {
      return;
    }

    const nextName = trimmedName;
    if (!nextName) {
      Alert.alert('Name fehlt', 'Bitte gib einen Namen ein.');
      return;
    }

    if (!hasChanges) {
      router.back();
      return;
    }

    setIsSaving(true);

    try {
      let nextPicture = profile.picture;

      if (selectedImage) {
        const uploadedImage = await uploadAttachment(accessToken, selectedImage);
        nextPicture = uploadedImage.url;
      }

      await updateCurrentUserProfile(accessToken, {
        name: nextName,
        picture: nextPicture,
      });

      router.back();
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === 'UnauthorizedError') {
        await logout();
        return;
      }

      Alert.alert(
        'Profil konnte nicht gespeichert werden',
        nextError instanceof Error ? nextError.message : 'Unknown error'
      );
    } finally {
      setIsSaving(false);
    }
  }, [accessToken, hasChanges, logout, profile, router, selectedImage, trimmedName]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#2E6B4B" size="large" />
          <Text style={styles.helperText}>Profil wird geladen...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !profile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Feather color="#1e2a1e" name="arrow-left" size={18} />
          </Pressable>

          <View style={styles.card}>
            <Text style={styles.title}>Profil bearbeiten</Text>
            <Text style={styles.copy}>{error || 'Keine Profildaten verfuegbar.'}</Text>
            <Pressable
              onPress={() => void loadProfile()}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryButtonLabel}>Erneut laden</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Pressable
          disabled={isSaving}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Feather color="#1e2a1e" name="arrow-left" size={18} />
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.title}>Profil bearbeiten</Text>
          <Text style={styles.copy}>{helperText}</Text>

          <View style={styles.avatarSection}>
            {previewImage ? (
              <Image
                contentFit="cover"
                source={buildAuthenticatedImageSource(previewImage, accessToken)}
                style={styles.avatarPreview}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Feather color="#5F6E5F" name="user" size={28} />
              </View>
            )}

            <Pressable
              disabled={isSaving}
              onPress={() => void handlePickImage()}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryButtonLabel}>Profilbild auswaehlen</Text>
            </Pressable>
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              autoCapitalize="words"
              editable={!isSaving}
              onChangeText={setName}
              placeholder="Dein Name"
              placeholderTextColor="#8A968A"
              style={styles.input}
              value={name}
            />
          </View>

          <Pressable
            disabled={isSaving || !hasChanges}
            onPress={() => void handleSave()}
            style={({ pressed }) => [
              styles.primaryButton,
              (isSaving || !hasChanges) && styles.primaryButtonDisabled,
              pressed && styles.pressed,
            ]}>
            {isSaving ? (
              <ActivityIndicator color="#F5F3EE" size="small" />
            ) : (
              <Text style={styles.primaryButtonLabel}>Speichern</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function ProfileEditScreen() {
  return (
    <AuthGuard>
      <ProfileEditContent />
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F3EE',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 18,
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#F0E9DD',
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  pressed: {
    opacity: 0.84,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    gap: 18,
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: '#141E14',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  title: {
    color: '#1E2A1E',
    fontFamily: Fonts.serif,
    fontSize: 24,
    lineHeight: 30,
  },
  copy: {
    color: '#5F6E5F',
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 22,
  },
  helperText: {
    color: '#6B7A6B',
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  avatarSection: {
    alignItems: 'center',
    gap: 12,
  },
  avatarPreview: {
    borderRadius: 54,
    height: 108,
    width: 108,
  },
  avatarFallback: {
    alignItems: 'center',
    backgroundColor: '#E8E2D7',
    borderRadius: 54,
    height: 108,
    justifyContent: 'center',
    width: 108,
  },
  formBlock: {
    gap: 8,
  },
  label: {
    color: '#1E2A1E',
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    backgroundColor: '#F8F6F1',
    borderColor: '#E3DDCF',
    borderRadius: 14,
    borderWidth: 1,
    color: '#1E2A1E',
    fontFamily: Fonts.sans,
    fontSize: 16,
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2E6B4B',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonLabel: {
    color: '#F5F3EE',
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#F0E9DD',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonLabel: {
    color: '#2E3A2E',
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
});
