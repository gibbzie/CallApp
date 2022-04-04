import './style.css';

import firebase from 'firebase/app';
import 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyA37ovhknkdl4Z3ZncLZ9S487IcYe_5xrQ",
  authDomain: "callapp-6e504.firebaseapp.com",
  projectId: "callapp-6e504",
  storageBucket: "callapp-6e504.appspot.com",
  messagingSenderId: "158283261786",
  appId: "1:158283261786:web:860a5937f7f509982d7563"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const shareScreenButton = document.getElementById('shareScreenButton');
const screenVideo = document.getElementById('screenVideo');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

let senders = [];

// 1. Setup media sources

webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
	localStream.getTracks().forEach((track) => {
		senders.push(track);
		pc.addTrack(track, localStream);
	});

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    })
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;

  webcamVideo.muted = true;
};

// 2. Create an offer
callButton.onclick = async () => {
	answerButton.disabled = true;
  // Reference Firestore collections for signaling
  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  callInput.value = callDoc.id;

  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer });

  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
  shareScreenButton.disabled = false;
	remoteVideo.controls = true;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');

  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const callData = (await callDoc.get()).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
  shareScreenButton.disabled = false;
	remoteVideo.controls = true;
};

// Screen Sharing https://www.youtube.com/watch?v=X8QHHB7DA90 06:21

let screenStream = null;
let screenStreamTrack = null;

shareScreenButton.onclick = async () => {
	screenStream = await navigator.mediaDevices.getDisplayMedia({ cursor: true });

	// get mediaTrack out of mediaStream
	screenStreamTrack = screenStream.getTracks()[0]

	// replace webcam video track with screen
	pc.getSenders().find(index => index.track.kind === 'video').replaceTrack(screenStreamTrack);

	// replaces the original webcam once the stop sharing button is clicked
	screenStreamTrack.onended = () => {
		let originalWebcamVideo = senders.find(index => index.kind === 'video');
		pc.getSenders().find(index => index.track.kind === 'video').replaceTrack(originalWebcamVideo);
		webcamVideo.srcObject = localStream;
	}

	webcamVideo.srcObject = screenStream;
};
