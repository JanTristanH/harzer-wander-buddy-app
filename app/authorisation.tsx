import { ThemedText } from "@/components/ThemedText";
import { router } from "expo-router";
import React from "react";
import { Alert, Button, View } from "react-native";
import { useAuth0 } from "react-native-auth0";

export default function AuthorizationScreen() {
  const { authorize, user, error, getCredentials, isLoading } = useAuth0();

  const onLogin = async () => {
    try {
      await authorize();
      let credentials = await getCredentials();
      Alert.alert("AccessToken: " + credentials?.accessToken);
      if (user !== undefined && user !== null) {
        router.replace("/(tabs)");
      }
    } catch (e) {
      console.log(e);
    }
  };

  if (isLoading) {
    return (
      <View>
        <ThemedText>Loading</ThemedText>
      </View>
    );
  }

  return (
    <View>
      <View>
        {!user ? (
          <ThemedText>You are not logged in</ThemedText>
        ) : (
          <ThemedText>You are logged in</ThemedText>
        )}
        <Button onPress={onLogin} title={"Log In"} />
        {error && <ThemedText>{error.message}</ThemedText>}
      </View>
    </View>
  );
}