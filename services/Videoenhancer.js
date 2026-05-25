/**
 * Videoenhancer.js
 * 
 * Real-time video quality enhancement for WebRTC calls.
 * 
 * কীভাবে কাজ করে:
 *   ১. SDP bitrate injection  → offer/answer এ b=AS: line দিয়ে bandwidth force করা
 *   ২. RTCRtpSender params    → connection এর পর encoding quality boost
 *   ৩. Camera constraints     → initLocalStream এ higher quality request
 * 
 * এই ৩টা layer মিলিয়ে খারাপ camera র video অনেক বেশি clear দেখাবে।
 */

// ─── Enhancement config ───────────────────────────────────────────────────────
export const ENHANCE_CONFIG = {
  // Video bitrate — default WebRTC ~300kbps, এখন 800kbps force করা হচ্ছে
  targetBitrateKbps: 800,

  // Frame rate
  targetFramerate: 30,

  // Camera resolution
  idealWidth:  1280,
  idealHeight: 720,
  minWidth:    320,
  minHeight:   240,
}

// ─── SDP Bitrate Booster ──────────────────────────────────────────────────────
// Offer/Answer এর SDP এ b=AS: line inject করে video bitrate force করা।
// এটা সবচেয়ে reliable method — সব WebRTC implementation এ কাজ করে।
// খারাপ camera র ক্ষেত্রে এই একটা fix ই quality অনেক উন্নত করে।
export const boostSdpBitrate = (sdp, bitrateKbps = ENHANCE_CONFIG.targetBitrateKbps) => {
  if (!sdp) return sdp

  const lines = sdp.split('\n')
  const result = []
  let inVideoSection = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (line.startsWith('m=video')) {
      inVideoSection = true
      result.push(lines[i])
      continue
    }

    if (line.startsWith('m=audio') || line.startsWith('m=application')) {
      inVideoSection = false
    }

    // Video section এ c= line এর পরে b=AS inject করো
    if (inVideoSection && line.startsWith('c=')) {
      result.push(lines[i])
      // পরের line যদি b= না হয় তাহলে inject করো
      if (!lines[i + 1]?.trim().startsWith('b=')) {
        result.push(`b=AS:${bitrateKbps}`)
        result.push(`b=TIAS:${bitrateKbps * 1000}`)
      }
      continue
    }

    // Existing b= line কে replace করো
    if (inVideoSection && line.startsWith('b=')) {
      result.push(`b=AS:${bitrateKbps}`)
      result.push(`b=TIAS:${bitrateKbps * 1000}`)
      continue
    }

    result.push(lines[i])
  }

  return result.join('\n')
}

// ─── RTCRtpSender Encoding Booster ───────────────────────────────────────────
// Connection হওয়ার পর RTCRtpSender এর encoding parameters set করে।
// maxBitrate, maxFramerate, priority — সব force করা হচ্ছে।
export const boostVideoEncoding = async (peerConnection, config = ENHANCE_CONFIG) => {
  if (!peerConnection) return

  try {
    const senders = peerConnection.getSenders ? peerConnection.getSenders() : []
    if (!senders || senders.length === 0) {
      console.log('[VideoEnhancer] No senders found — skipping encoding boost')
      return
    }

    for (const sender of senders) {
      if (!sender.track || sender.track.kind !== 'video') continue

      // getParameters support check
      if (typeof sender.getParameters !== 'function') continue
      const params = sender.getParameters()
      if (!params) continue

      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}]
      }

      params.encodings = params.encodings.map((enc) => ({
        ...enc,
        maxBitrate:            config.targetBitrateKbps * 1000,
        maxFramerate:          config.targetFramerate,
        scaleResolutionDownBy: 1.0,
        // Priority: high quality — network পারলে সর্বোচ্চ quality পাঠাবে
        networkPriority: 'high',
        priority:        'high',
      }))

      if (typeof sender.setParameters === 'function') {
        await sender.setParameters(params)
        console.log(`[VideoEnhancer] ✅ Encoding boosted → ${config.targetBitrateKbps}kbps @ ${config.targetFramerate}fps`)
      }
    }
  } catch (err) {
    // Non-critical — call চলতে থাকবে, শুধু boost হবে না
    console.warn('[VideoEnhancer] Encoding boost skipped:', err.message)
  }
}

// ─── Enhanced Camera Constraints ─────────────────────────────────────────────
// initLocalStream এ use করার জন্য improved constraints।
// Fallback constraints ও দেওয়া আছে যদি device support না করে।
export const getEnhancedVideoConstraints = (config = ENHANCE_CONFIG) => ({
  width:     { min: config.minWidth,  ideal: config.idealWidth,  max: 1920 },
  height:    { min: config.minHeight, ideal: config.idealHeight, max: 1080 },
  frameRate: { min: 15,               ideal: config.targetFramerate, max: 60 },
  facingMode: 'user',
  // Hardware-level improvements — supported device এ কাজ করে
  advanced: [
    { width: config.idealWidth, height: config.idealHeight },
  ],
})

export const getFallbackVideoConstraints = () => ({
  width:     { ideal: 640 },
  height:    { ideal: 480 },
  frameRate: { ideal: 24 },
  facingMode: 'user',
})


// ─── Audio SDP Optimizer ──────────────────────────────────────────────────────
// Opus codec কে voice mode এ configure করা হচ্ছে।
// DTX: silence এ কোনো packet পাঠাবে না → background noise আসবে না
// FEC: packet loss এ voice টুকু রক্ষা করবে
// maxaveragebitrate: voice এর জন্য 32kbps যথেষ্ট, বেশি হলে noise ও বাড়ে
export const optimizeAudioSdp = (sdp) => {
  if (!sdp) return sdp

  const lines  = sdp.split('\n')
  const result = []

  // Opus payload type খুঁজে বের করো
  let opusPayload = null
  for (const line of lines) {
    const match = line.match(/a=rtpmap:(\d+) opus\/48000/)
    if (match) { opusPayload = match[1]; break }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // আগের opus fmtp line থাকলে replace করো
    if (opusPayload && line.startsWith(`a=fmtp:${opusPayload}`)) {
      result.push(
        `a=fmtp:${opusPayload} minptime=10;useinbandfec=1;usedtx=1;` +
        `stereo=0;maxaveragebitrate=32000;cbr=0;` +
        `sprop-maxcapturerate=16000`
      )
      continue
    }

    result.push(lines[i])

    // fmtp না থাকলে rtpmap এর পরে inject করো
    if (opusPayload && line.startsWith(`a=rtpmap:${opusPayload} opus`)) {
      const nextLine = lines[i + 1]?.trim() || ''
      if (!nextLine.startsWith(`a=fmtp:${opusPayload}`)) {
        result.push(
          `a=fmtp:${opusPayload} minptime=10;useinbandfec=1;usedtx=1;` +
          `stereo=0;maxaveragebitrate=32000;cbr=0;` +
          `sprop-maxcapturerate=16000`
        )
      }
    }
  }

  return result.join('\n')
}