
import { StatusBar, StyleSheet, useColorScheme, Text, View,Button, Platform, PermissionsAndroid } from 'react-native';
import {SafeAreaProvider, useSafeAreaInsets,
} from 'react-native-safe-area-context';
import Sound from 'react-native-nitro-sound';
import React,{useState} from 'react';

export default function App() {
const[recording,setRecording] = useState(false);
const [recordings, setRecordings] = useState<string[]>([]);
const isDarkMode = useColorScheme() === 'dark';

const requestPermission = async () => {
if(Platform.OS==='android'){
const granted=await PermissionsAndroid.request(
PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
);
return granted === PermissionsAndroid.RESULTS.GRANTED;
}
return true;
};

const startRecording = async () => {
const ok = await requestPermission();
if (!ok) return;
const path = Platform.select({
ios: 'recording.m4a',
android: `${Date.now()}.mp4`
});
await Sound.startRecorder();
setRecording(true);
};
const stopRecording = async () => {
const uri = await Sound.stopRecorder();
setRecording(false);

setRecordings(prev => [...prev, uri]);
};

const playRecording = async (uri: string) => {
await Sound.startPlayer(uri);
};

return (
<View style={styles.container}>

<Button
title={recording ? "Stop Recording" : "Start Recording"}
onPress={recording ? stopRecording : startRecording}
/>

{recordings.map((uri, index) => (
<View key={index} style={styles.row}>
<Text>Recording #{index + 1}</Text>
<Button title="Play" onPress={() => playRecording(uri)} />
</View>
))}

</View>
);
}


const styles = StyleSheet.create({
container: {
flex: 1,
alignItems: 'center',
justifyContent: 'center',
},
});


