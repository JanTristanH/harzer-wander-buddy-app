import { Platform, ScrollView, StyleSheet } from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { authClient } from "@/lib/auth-client";
import { config } from "@/lib/constants";
import { useEffect, useState } from "react";

export default function TabTwoScreen() {

    const [stamps, setStamps] = useState([]);

  useEffect(() => {
    fetchStamps();
  }, []);

  async function fetchStamps() {
    const url = `${config.baseUrl}/Stampboxes?$skip=0&$top=5&$orderby=orderBy%20asc&$select=ID,name,hasVisited`;

    // WEB: rely on browser cookies + credentials=include
    if (Platform.OS === "web") {
      const response = await fetch(url, {
        credentials: "include", // send HttpOnly cookies with the request
      });

      if (!response.ok) {
        // handle / log error
        console.error("Failed to fetch stamps (web)", response.status);
        return;
      }

      const data = await response.json();
      console.log(`Received data: ${JSON.stringify(data, null, 2)}`);
      setStamps(data.value);
      return data;
    }

    // NATIVE: use Better Auth cookie/session
    const cookies = authClient.getCookie(); // sync, as in your code

    const response = await fetch(url, {
      headers: {
        Cookie: cookies,
      },
      // cookie is set manually in headers, so we can omit credentials
      credentials: "omit",
    });

    if (!response.ok) {
      console.error("Failed to fetch stamps (native)", response.status);
      return;
    }

    const data = await response.json();
    return data;
  }

  return (
    <ThemedView style={styles.titleContainer}>
      <ThemedText type="title">Explore</ThemedText>
      <ScrollView>
        {stamps?.map((stamp: any) => (
          <ThemedText key={stamp.ID}>
            {stamp.name} - Visited: {stamp.hasVisited ? "Yes" : "No"}
          </ThemedText>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: "row",
    gap: 8,
  },
});
