import { Ionicons } from '@expo/vector-icons'
import React, { useCallback, useRef, useState } from 'react'
import {
    Image,
    Platform, ScrollView,
    StyleSheet,
    Text,
    TextInput, TouchableOpacity,
    View
} from 'react-native'
import {
    pickAudio,
    pickContact,
    pickDocument,
    pickFromCamera,
    pickFromGallery,
    shareCurrentLocation,
    uploadVoice,
} from '../services/mediaPickers'
import { T } from '../theme'
import AttachmentMenu from './AttachmentMenu'
import VoiceRecorder from './VoiceRecorder'

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp-style full emoji dataset — all categories
// ─────────────────────────────────────────────────────────────────────────────
const EMOJI_CATEGORIES = [
  {
    id: 'recent',
    label: 'Recent',
    icon: '🕐',
    emojis: [], // filled dynamically from recent usage
  },
  {
    id: 'smileys',
    label: 'Smileys & People',
    icon: '😀',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃',
      '😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚',
      '😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭',
      '🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄',
      '😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕',
      '🤢','🤮','🤧','🥵','🥶','🥴','😵','💫','🤯','🤠',
      '🥸','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯',
      '😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭',
      '😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡',
      '😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺',
      '👻','👽','👾','🤖','😺','😸','😹','😻','😼','😽',
      '🙀','😿','😾','🙈','🙉','🙊',
      // People
      '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞',
      '🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍',
      '👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝',
      '🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂',
      '🦻','👃','🫀','🫁','🧠','🦷','🦴','👁️','👀','👣',
      '👤','👥','🫂','👶','🧒','👦','👧','🧑','👱','👨',
      '🧔','👩','🧓','👴','👵','🙍','🙎','🙅','🙆','💁',
      '🙋','🧏','🙇','🤦','🤷','💆','💇','🚶','🧍','🧎',
      '🏃','💃','🕺','🕴️','👫','👬','👭','👨‍👩‍👦','👨‍👩‍👧',
    ],
  },
  {
    id: 'animals',
    label: 'Animals & Nature',
    icon: '🐶',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨',
      '🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔',
      '🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴',
      '🦄','🐝','🐛','🦋','🐌','🐞','🐜','🪲','🦟','🦗',
      '🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐',
      '🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🦭',
      '🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏',
      '🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖',
      '🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈',
      '🐈‍⬛','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇',
      '🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔',
      '🌵','🎄','🌲','🌳','🌴','🪵','🌱','🌿','☘️','🍀',
      '🎍','🪴','🎋','🍃','🍂','🍁','🪺','🪹','🍄','🌾',
      '💐','🌷','🌹','🥀','🌺','🌸','🌼','🌻','🌞','🌝',
      '🍇','🍈','🍉','🍊','🍋','🍌','🍍','🥭','🍎','🍏',
      '🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘','🌙','🌚',
      '🌛','🌜','🌚','⭐','🌟','💫','✨','☄️','☀️','🌤️',
      '⛅','🌦️','🌈','☁️','⛈️','🌩️','🌨️','❄️','☃️','⛄',
      '🌬️','💨','🌀','🌊','💧','💦','☔','⚡','🔥','🌍',
    ],
  },
  {
    id: 'food',
    label: 'Food & Drink',
    icon: '🍔',
    emojis: [
      '🍇','🍈','🍉','🍊','🍋','🍌','🍍','🥭','🍎','🍏',
      '🍐','🍑','🍒','🍓','🫐','🥝','🍅','🫒','🥥','🥑',
      '🍆','🥔','🥕','🌽','🌶️','🫑','🥒','🥬','🥦','🧄',
      '🧅','🍄','🥜','🌰','🍞','🥐','🥖','🫓','🥨','🧀',
      '🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭',
      '🍔','🍟','🍕','🫔','🌮','🌯','🥙','🧆','🥚','🍳',
      '🥘','🍲','🫕','🥣','🥗','🍿','🧂','🥫','🍱','🍘',
      '🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥',
      '🥮','🍡','🥟','🥠','🥡','🦀','🦞','🦐','🦑','🦪',
      '🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫',
      '🍬','🍭','🍮','🍯','🍼','🥛','☕','🫖','🍵','🧃',
      '🥤','🧋','🍶','🍾','🍷','🍸','🍹','🍺','🍻','🥂',
      '🥃','🫗','🥂','🧊','🥄','🍴','🍽️','🥢','🧆',
    ],
  },
  {
    id: 'activities',
    label: 'Activities',
    icon: '⚽',
    emojis: [
      '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱',
      '🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳',
      '🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷',
      '⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','⛹️',
      '🤺','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴',
      '🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️',
      '🎪','🤹','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎵',
      '🎶','🎷','🪗','🎸','🎹','🎺','🎻','🪕','🥁','🪘',
      '🎮','🕹️','🎲','🧩','🎯','🪄','🎰','🎳','🧸','🪆',
      '♟️','🃏','🀄','🎴','🎭','🖼️','🎨','🧶','🧵','🪢',
    ],
  },
  {
    id: 'travel',
    label: 'Travel & Places',
    icon: '✈️',
    emojis: [
      '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐',
      '🛻','🚚','🚛','🚜','🏍️','🛵','🛺','🚲','🛴','🛹',
      '🚏','🛣️','🛤️','⛽','🚨','🚥','🚦','🛑','🚧','⚓',
      '⛵','🛶','🚤','🛥️','🛳️','⛴️','🚢','✈️','🛩️','🛫',
      '🛬','🪂','💺','🚁','🚟','🚠','🚡','🛰️','🚀','🛸',
      '🪐','🌍','🌎','🌏','🌐','🗺️','🗾','🧭','🏔️','⛰️',
      '🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🏛️','🏗️',
      '🧱','🪨','🪵','🛖','🏘️','🏚️','🏠','🏡','🏢','🏣',
      '🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯',
      '🏰','💒','🗼','🗽','⛪','🕌','🛕','🕍','⛩️','🕋',
      '⛲','⛺','🌁','🌃','🏙️','🌄','🌅','🌆','🌇','🌉',
      '♨️','🎠','🎡','🎢','💈','🎪','🛎️','🗿','🗺️','🗺️',
    ],
  },
  {
    id: 'objects',
    label: 'Objects',
    icon: '💡',
    emojis: [
      '⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💽',
      '💾','💿','📀','🧮','📷','📸','📹','🎥','📽️','🎞️',
      '📞','☎️','📟','📠','📺','📻','🧭','⏱️','⏲️','⏰',
      '🕰️','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯️','🪔',
      '🧱','🔑','🗝️','🔒','🔓','🔏','🗄️','🗑️','🔧','🔨',
      '⚒️','🛠️','⛏️','🪛','🪚','🔩','⚙️','🗜️','⚖️','🦯',
      '🔗','⛓️','🪝','🧲','🪜','🧰','🪤','🪣','🧲','🔬',
      '🔭','📡','💉','🩸','💊','🩹','🩼','🩺','🩻','🚪',
      '🛗','🪞','🪟','🛏️','🛋️','🚽','🪠','🚿','🛁','🪥',
      '🧴','🧷','🧹','🧺','🧻','🪣','🧼','🫧','🪥','🧽',
      '🛒','🚬','⚰️','🪦','⚱️','🗺️','🧭','💎','💍','👑',
      '💄','👜','👛','👓','🕶️','🥽','🌂','☂️','🧵','🧶',
      '💰','💳','💸','💵','💴','💶','💷','💹','📈','📉',
      '📊','📋','📌','📍','📎','🖇️','📏','📐','✂️','🗃️',
      '🗂️','🗳️','📁','📂','📝','📓','📔','📒','📕','📗',
      '📘','📙','📚','📖','🔖','🔍','🔎','🔐','📰','🗞️',
    ],
  },
  {
    id: 'symbols',
    label: 'Symbols',
    icon: '❤️',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
      '❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟',
      '☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️',
      '🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏',
      '♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴',
      '📵','🚫','⛔','🚳','🚭','🚯','🚱','🚷','🔞','📵',
      '🔕','🔇','📢','📣','🔔','🔕','🎵','🎶','💹','🆚',
      '🆘','🆙','🆕','🆓','🆒','🆗','🆖','🅾️','🆎','🅱️',
      '🆑','🆑','🅰️','🔅','🔆','📶','📳','📴','♻️','🔱',
      '📛','🔰','⭕','✅','☑️','✔️','❌','❎','➕','➖',
      '➗','✖️','🔀','🔁','🔂','▶️','⏩','⏭️','⏯️','◀️',
      '⏪','⏮️','🔼','⏫','🔽','⏬','⏸️','⏹️','⏺️','🎦',
      '🔊','🔉','🔈','🔇','📣','📢','🔔','🔕','🃏','🀄',
      '♠️','♣️','♥️','♦️','🎰','🔃','🔄','🔙','🔚','🔛',
      '🔜','🔝','🛐','⚜️','🔱','📛','🔰','🔟','🔠','🔡',
      '🔢','🔣','🔤','🅰️','🅱️','🆎','🆑','🅾️','🆘','❓',
      '❔','❕','❗','〽️','⚠️','🚸','🔰','♻️','✅','🈴',
      '#️⃣','*️⃣','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣',
      '8️⃣','9️⃣','🔟','💯','🔢','▶️','⏩','⬛','⬜','◼️',
      '◻️','◾','◽','▪️','▫️','🔶','🔷','🔸','🔹','🔺',
      '🔻','💠','🔘','🔳','🔲','🏁','🚩','🎌','🏴','🏳️',
    ],
  },
  {
    id: 'flags',
    label: 'Flags',
    icon: '🏳️',
    emojis: [
      '🏳️','🏴','🏴‍☠️','🚩','🎌','🏁','🏳️‍🌈','🏳️‍⚧️',
      '🇦🇫','🇦🇱','🇩🇿','🇦🇩','🇦🇴','🇦🇬','🇦🇷','🇦🇲',
      '🇦🇺','🇦🇹','🇦🇿','🇧🇸','🇧🇭','🇧🇩','🇧🇧','🇧🇾',
      '🇧🇪','🇧🇿','🇧🇯','🇧🇹','🇧🇴','🇧🇦','🇧🇼','🇧🇷',
      '🇧🇳','🇧🇬','🇧🇫','🇧🇮','🇨🇻','🇰🇭','🇨🇲','🇨🇦',
      '🇨🇫','🇹🇩','🇨🇱','🇨🇳','🇨🇴','🇰🇲','🇨🇬','🇨🇩',
      '🇨🇷','🇭🇷','🇨🇺','🇨🇾','🇨🇿','🇩🇰','🇩🇯','🇩🇲',
      '🇩🇴','🇪🇨','🇪🇬','🇸🇻','🇬🇶','🇪🇷','🇪🇪','🇸🇿',
      '🇪🇹','🇫🇯','🇫🇮','🇫🇷','🇬🇦','🇬🇲','🇬🇪','🇩🇪',
      '🇬🇭','🇬🇷','🇬🇩','🇬🇹','🇬🇳','🇬🇼','🇬🇾','🇭🇹',
      '🇭🇳','🇭🇺','🇮🇸','🇮🇳','🇮🇩','🇮🇷','🇮🇶','🇮🇪',
      '🇮🇱','🇮🇹','🇯🇲','🇯🇵','🇯🇴','🇰🇿','🇰🇪','🇰🇮',
      '🇰🇼','🇰🇬','🇱🇦','🇱🇻','🇱🇧','🇱🇸','🇱🇷','🇱🇾',
      '🇱🇮','🇱🇹','🇱🇺','🇲🇬','🇲🇼','🇲🇾','🇲🇻','🇲🇱',
      '🇲🇹','🇲🇭','🇲🇷','🇲🇺','🇲🇽','🇫🇲','🇲🇩','🇲🇨',
      '🇲🇳','🇲🇪','🇲🇦','🇲🇿','🇲🇲','🇳🇦','🇳🇷','🇳🇵',
      '🇳🇱','🇳🇿','🇳🇮','🇳🇪','🇳🇬','🇳🇴','🇴🇲','🇵🇰',
      '🇵🇼','🇵🇦','🇵🇬','🇵🇾','🇵🇪','🇵🇭','🇵🇱','🇵🇹',
      '🇶🇦','🇷🇴','🇷🇺','🇷🇼','🇰🇳','🇱🇨','🇻🇨','🇼🇸',
      '🇸🇲','🇸🇹','🇸🇦','🇸🇳','🇷🇸','🇸🇨','🇸🇱','🇸🇬',
      '🇸🇰','🇸🇮','🇸🇧','🇸🇴','🇿🇦','🇸🇸','🇪🇸','🇱🇰',
      '🇸🇩','🇸🇷','🇸🇪','🇨🇭','🇸🇾','🇹🇼','🇹🇯','🇹🇿',
      '🇹🇭','🇹🇱','🇹🇬','🇹🇴','🇹🇹','🇹🇳','🇹🇷','🇹🇲',
      '🇺🇬','🇺🇦','🇦🇪','🇬🇧','🏴󠁧󠁢󠁥󠁮󠁧󠁿','🏴󠁧󠁢󠁳󠁣󠁴󠁿','🏴󠁧󠁢󠁷󠁬󠁳󠁿','🇺🇸',
      '🇺🇾','🇺🇿','🇻🇺','🇻🇪','🇻🇳','🇾🇪','🇿🇲','🇿🇼',
    ],
  },
]

// Max recent emojis to store
const MAX_RECENT = 40

// ─────────────────────────────────────────────────────────────────────────────
// Emoji Picker — WhatsApp exact layout
// LEFT: vertical category sidebar | RIGHT: scrollable emoji grid
// ─────────────────────────────────────────────────────────────────────────────
function EmojiPicker({ onSelect, recentEmojis }) {
  const [activeCat, setActiveCat] = useState(recentEmojis.length > 0 ? 'recent' : 'smileys')
  const catScrollRef = useRef(null)

  const categories = EMOJI_CATEGORIES.map((cat) =>
    cat.id === 'recent' ? { ...cat, emojis: recentEmojis } : cat
  ).filter((cat) => cat.id !== 'recent' || cat.emojis.length > 0)

  const currentEmojis = categories.find((c) => c.id === activeCat)?.emojis ?? []

  const handleCatPress = (catId, idx) => {
    setActiveCat(catId)
    catScrollRef.current?.scrollTo({ y: Math.max(0, idx * 48 - 96), animated: true })
  }

  return (
    <View style={ep.container}>

      {/* ── LEFT: vertical category sidebar (like WhatsApp) ── */}
      <View style={ep.sidebar}>
        <ScrollView
          ref={catScrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          {categories.map((cat, idx) => {
            const isActive = activeCat === cat.id
            return (
              <TouchableOpacity
                key={cat.id}
                style={[ep.sideItem, isActive && ep.sideItemActive]}
                onPress={() => handleCatPress(cat.id, idx)}
                activeOpacity={0.65}
              >
                {isActive && <View style={ep.activeBar} />}
                <Text style={ep.sideIcon}>{cat.icon}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      {/* ── RIGHT: category name + emoji grid ── */}
      <View style={ep.gridWrap}>
        <Text style={ep.catTitle} numberOfLines={1}>
          {categories.find((c) => c.id === activeCat)?.label ?? ''}
        </Text>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={ep.grid}
          keyboardShouldPersistTaps="always"
        >
          {currentEmojis.length === 0 ? (
            <View style={ep.emptyWrap}>
              <Text style={ep.emptyIcon}>🕐</Text>
              <Text style={ep.emptyText}>No recent emojis yet</Text>
              <Text style={ep.emptySub}>Tap any emoji to save it here</Text>
            </View>
          ) : (
            currentEmojis.map((emoji, i) => (
              <TouchableOpacity
                key={`${emoji}-${i}`}
                onPress={() => onSelect(emoji)}
                style={ep.emojiBtn}
                activeOpacity={0.5}
              >
                <Text style={ep.emoji}>{emoji}</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>

    </View>
  )
}
// ─────────────────────────────────────────────────────────────────────────────
// Pending media thumbnail
// ─────────────────────────────────────────────────────────────────────────────
function PendingThumb({ item, onRemove }) {
  const isDoc = item.type === 'document' || item.type === 'audio'
  const uri = item.localUri || item.url
  return (
    <View style={pt.wrap}>
      {isDoc ? (
        <View style={pt.docBox}>
          <Ionicons name={item.type === 'audio' ? 'musical-note' : 'document-text'} size={22} color={T.accent} />
          <Text style={pt.docName} numberOfLines={2}>{item.fileName || 'file'}</Text>
        </View>
      ) : (
        <Image source={{ uri }} style={pt.img} resizeMode="cover" />
      )}
      {item.type === 'video' && (
        <View style={pt.videoIcon}>
          <Ionicons name="play" size={12} color="#fff" />
        </View>
      )}
      <TouchableOpacity style={pt.remove} onPress={onRemove}>
        <Ionicons name="close-circle" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main MessageInput
// ─────────────────────────────────────────────────────────────────────────────
export default function MessageInput({
  onSend,
  onSendMedia,
  onTyping,
  editingMessage,
  onCancelEdit,
}) {
  const [text, setText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [recording, setRecording] = useState(false)
  const [voiceUploading, setVoiceUploading] = useState(false)
  const [pendingMedia, setPendingMedia] = useState([])
  const [recentEmojis, setRecentEmojis] = useState([])
  const inputRef = useRef(null)

  React.useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.text || '')
      inputRef.current?.focus()
    }
  }, [editingMessage])

  const hasText = text.trim().length > 0
  const hasPending = pendingMedia.length > 0

  const handleEmojiSelect = useCallback((emoji) => {
    setText((p) => p + emoji)
    // Update recent emojis
    setRecentEmojis((prev) => {
      const filtered = prev.filter((e) => e !== emoji)
      return [emoji, ...filtered].slice(0, MAX_RECENT)
    })
  }, [])

  const handleSend = () => {
    if (!hasText && !hasPending) return
    onSend?.({ text: text.trim(), media: pendingMedia })
    setText('')
    setPendingMedia([])
    setShowEmoji(false)
  }

  const handleAttach = async (type) => {
    setShowAttach(false)
    try {
      if (type === 'location') {
        const media = await shareCurrentLocation()
        if (media) onSendMedia?.(media)
        return
      }
      if (type === 'contact') {
        const media = await pickContact()
        if (media) onSendMedia?.(media)
        return
      }
      let result = null
      if (type === 'gallery')       result = await pickFromGallery()
      else if (type === 'camera')   result = await pickFromCamera()
      else if (type === 'document') result = await pickDocument()
      else if (type === 'audio')    result = await pickAudio()

      if (!result) return
      const arr = Array.isArray(result) ? result : [result]
      setPendingMedia((prev) => [...prev, ...arr])
    } catch (e) {
      console.log('attach error', e?.message)
    }
  }

  const removePending = (idx) => {
    setPendingMedia((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleVoiceComplete = async ({ uri, duration, mime }) => {
    setRecording(false)
    setVoiceUploading(true)
    try {
      const media = await uploadVoice({ uri, duration, mime, onProgress: () => {} })
      setVoiceUploading(false)
      onSendMedia?.(media)
    } catch (e) {
      console.log('voice upload err', e?.message)
      setVoiceUploading(false)
    }
  }

  return (
    <View>
      {showAttach && (
        <AttachmentMenu onSelect={handleAttach} onClose={() => setShowAttach(false)} />
      )}

      {voiceUploading && (
        <View style={s.uploadBar}>
          <Text style={s.uploadText}>Sending voice message…</Text>
        </View>
      )}

      {editingMessage && (
        <View style={s.editBanner}>
          <Ionicons name="create-outline" size={16} color={T.accent} />
          <Text style={s.editBannerTxt} numberOfLines={1}>
            Editing: {editingMessage.text}
          </Text>
          <TouchableOpacity onPress={() => { onCancelEdit?.(); setText('') }} style={s.editCancelBtn}>
            <Ionicons name="close" size={18} color={T.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {hasPending && (
        <View style={s.pendingStrip}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pendingScroll}>
            {pendingMedia.map((item, i) => (
              <PendingThumb key={i} item={item} onRemove={() => removePending(i)} />
            ))}
          </ScrollView>
        </View>
      )}

      <View style={s.wrapper}>
        {showEmoji && (
          <EmojiPicker onSelect={handleEmojiSelect} recentEmojis={recentEmojis} />
        )}

        {recording ? (
          <VoiceRecorder onCancel={() => setRecording(false)} onComplete={handleVoiceComplete} />
        ) : (
          <View style={s.row}>
            <TouchableOpacity
              onPress={() => { setShowEmoji((p) => !p); setShowAttach(false) }}
              style={s.sideBtn}
            >
              <Ionicons
                name={showEmoji ? 'keypad-outline' : 'happy-outline'}
                size={25}
                color={showEmoji ? T.accent : T.textSecond}
              />
            </TouchableOpacity>

            <View style={s.inputWrap}>
              <TextInput
                ref={inputRef}
                value={text}
                onChangeText={(t) => { setText(t); onTyping?.() }}
                placeholder={editingMessage ? 'Edit message…' : 'Message...'}
                placeholderTextColor={T.textMuted}
                style={s.input}
                multiline
                maxLength={2000}
                onFocus={() => { setShowEmoji(false); setShowAttach(false) }}
              />
              {!editingMessage && (
                <TouchableOpacity
                  onPress={() => { setShowAttach((p) => !p); setShowEmoji(false) }}
                  style={s.attachBtn}
                >
                  <Ionicons
                    name="attach"
                    size={22}
                    color={showAttach ? T.accent : T.textSecond}
                    style={{ transform: [{ rotate: '45deg' }] }}
                  />
                </TouchableOpacity>
              )}
              {!hasText && !hasPending && !editingMessage && (
                <TouchableOpacity onPress={() => handleAttach('camera')} style={s.attachBtn}>
                  <Ionicons name="camera-outline" size={22} color={T.textSecond} />
                </TouchableOpacity>
              )}
            </View>

            {hasText || hasPending ? (
              <TouchableOpacity onPress={handleSend} style={s.sendBtn} activeOpacity={0.85}>
                <Ionicons name="send" size={20} color="#0D1117" />
              </TouchableOpacity>
            ) : (
              !editingMessage && (
                <TouchableOpacity onPress={() => setRecording(true)} style={s.sendBtn} activeOpacity={0.85}>
                  <Ionicons name="mic" size={22} color="#0D1117" />
                </TouchableOpacity>
              )
            )}
          </View>
        )}
      </View>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  wrapper: {
    backgroundColor: T.surface,
    borderTopWidth: 1, borderTopColor: T.border,
    paddingHorizontal: 8, paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 4 : 8,
  },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  sideBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: T.surfaceHigh, borderRadius: 22,
    borderWidth: 1, borderColor: T.border,
    paddingHorizontal: 10, paddingVertical: 6,
    minHeight: 42, maxHeight: 120, gap: 4,
  },
  input: { flex: 1, color: T.textPrimary, fontSize: 15, paddingTop: 4, paddingBottom: 4, maxHeight: 108 },
  attachBtn: { padding: 4, alignSelf: 'flex-end', marginBottom: 2 },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: T.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
    shadowColor: T.accent, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 5,
  },
  uploadBar: {
    height: 28, backgroundColor: T.accentDim,
    justifyContent: 'center', alignItems: 'center',
  },
  uploadText: { color: T.accent, fontSize: 12, fontWeight: '500' },
  editBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.surfaceHigh,
    paddingHorizontal: 12, paddingVertical: 8, gap: 8,
    borderTopWidth: 1, borderTopColor: T.border,
  },
  editBannerTxt: { flex: 1, color: T.textPrimary, fontSize: 13 },
  editCancelBtn: { padding: 2 },
  pendingStrip: {
    backgroundColor: T.surfaceHigh,
    borderTopWidth: 1, borderTopColor: T.border,
    paddingVertical: 8,
  },
  pendingScroll: { paddingHorizontal: 10, gap: 8 },
})

// ── Emoji picker styles — WhatsApp sidebar layout
const ep = StyleSheet.create({
  container: {
    height: 310,
    flexDirection: 'row',
    backgroundColor: T.bg,
    borderTopWidth: 1,
    borderTopColor: T.border,
    marginBottom: 4,
  },

  // Left vertical sidebar
  sidebar: {
    width: 52,
    backgroundColor: T.surface,
    borderRightWidth: 1,
    borderRightColor: T.border,
  },
  sideItem: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  sideItemActive: {
    backgroundColor: T.surfaceHigh,
  },
  sideIcon: { fontSize: 22 },
  activeBar: {
    position: 'absolute',
    left: 0, top: 8, bottom: 8,
    width: 3,
    backgroundColor: T.accent,
    borderRadius: 2,
  },

  // Right grid area
  gridWrap: {
    flex: 1,
    backgroundColor: T.surfaceHigh,
  },
  catTitle: {
    color: T.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    marginBottom: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 2,
    paddingBottom: 16,
  },
  emojiBtn: {
    width: '14.285%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 25 },

  emptyWrap: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  emptyIcon: { fontSize: 38, marginBottom: 10 },
  emptyText: { color: T.textSecond, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  emptySub:  { color: T.textMuted,  fontSize: 12, marginTop: 4,  textAlign: 'center' },
})

const pt = StyleSheet.create({
  wrap: { position: 'relative', width: 72, height: 72 },
  img: { width: 72, height: 72, borderRadius: 10, backgroundColor: T.border },
  docBox: {
    width: 72, height: 72, borderRadius: 10,
    backgroundColor: T.accentDim,
    alignItems: 'center', justifyContent: 'center', padding: 4,
  },
  docName: { color: T.accent, fontSize: 9, marginTop: 3, textAlign: 'center' },
  videoIcon: {
    position: 'absolute', bottom: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, padding: 2,
  },
  remove: { position: 'absolute', top: -4, right: -4 },
})