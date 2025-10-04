import { ThemedText } from "@/components/ThemedText";
import { router } from "expo-router";
import { Button, View } from "react-native";
import { useAuth0 } from "react-native-auth0";

import React from 'react';

export default function ProfilePage() {
  const { user, clearSession } = useAuth0();

  const onLogout = async () => {
    try {
      await clearSession();
      router.replace("/authorisation");
    } catch (e) {
      console.log("Log out cancelled");
    }
  };

  return (
    <View>
      {/* displaying user credentials */}
      <ThemedText>{user?.name}</ThemedText>
      {/* log out button */}
      <Button onPress={onLogout} title={"Log out"} />
    </View>
  );
}