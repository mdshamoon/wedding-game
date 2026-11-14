// All story text and speakers. Edit freely: names, jokes and lines.
import { CONFIG } from '../config.js';

const G = CONFIG.groomName, B = CONFIG.brideName;

const groomBase = { skin: '#b98361', hair: '#1a1310', hairStyle: 'short', beard: 'full', glasses: true };
export const SPEAKERS = {
  groom: { id: 'groom', name: G, avatar: { ...groomBase, outfit: '#c2ab8a', collar: '#b39b78' } },
  groomHaldi: { id: 'groom', variant: 'haldi', name: G, avatar: { ...groomBase, outfit: '#f6f0e2', collar: '#efe7d4', outfitTrim: '#e8dfcc', dupatta: '#f6c21a', haldi: 1 } },
  groomSehra: { id: 'groom', variant: 'sehra', name: G, avatar: { ...groomBase, head: 'sehra', headColor: '#f1d9c8', outfit: '#f3e7cf', outfitTrim: '#c9a24a', garland: true } },
  groomSafa: { id: 'groom', variant: 'safa', name: G, avatar: { ...groomBase, head: 'safa', headColor: '#f1d9c8', outfit: '#f3e7cf', outfitTrim: '#c9a24a' } },
  groomWalima: { id: 'groom', variant: 'walima', name: G, avatar: { ...groomBase, outfit: '#1b2440', outfitTrim: '#c9a24a' } },
  bride: { id: 'bride', name: B, avatar: { skin: '#d2a07c', head: 'bridal', headColor: '#8e1b2e', headTrim: '#d4af37', jewel: 'bridal', kajal: true, lips: '#a33a3a', outfit: '#8e1b2e', outfitTrim: '#d4af37' } },
  brideWalima: { id: 'bride', variant: 'walima', name: B, avatar: { skin: '#d2a07c', hairStyle: 'long', hair: '#24160f', jewel: 'earrings', kajal: true, lips: '#b4505a', outfit: '#e9c3bd', outfitTrim: '#d4af37', dupatta: '#f3dcd6' } },
  ammi: { id: 'ammi', name: 'Ammi', avatar: { skin: '#c99572', head: 'dupatta', headColor: '#0f4a38', headTrim: '#d4af37', jewel: 'earrings', outfit: '#0f4a38', outfitTrim: '#d4af37', lips: '#94443d' } },
  abbu: { id: 'abbu', name: 'Abbu', avatar: { skin: '#b07c58', hairStyle: 'grey', hair: '#b9b4ac', beard: 'full', beardColor: '#a9a39a', outfit: '#f5f2ea', collar: '#5a4a3a', glasses: false } },
  baji: { id: 'baji', name: 'Baji', avatar: { skin: '#c99572', hairStyle: 'long', hair: '#1d1410', jewel: 'earrings', kajal: true, outfit: '#c0587a', dupatta: '#e9b8b5', lips: '#a24a55' } },
  dost: { id: 'dost', name: 'Best Friend', avatar: { skin: '#ae7a56', hairStyle: 'short', hair: '#140f0c', beard: 'stubble', outfit: '#2f4a6a', collar: '#24384f' } },
  cousins: { id: 'cousins', name: 'The Cousin Squad', avatar: { skin: '#c08a64', hairStyle: 'short', hair: '#1d1410', outfit: '#f6c21a', collar: '#e0a800' } },
  khala: { id: 'khala', name: 'Khala Jaan', avatar: { skin: '#c48e6a', head: 'dupatta', headColor: '#7a3b62', headTrim: '#d4af37', jewel: 'earrings', outfit: '#7a3b62', lips: '#8a3b45' } },
  mamu: { id: 'mamu', name: 'Mamu Jaan', avatar: { skin: '#a8724f', hairStyle: 'short', hair: '#3a332d', beard: 'stubble', outfit: '#e9e1cf', collar: '#3d5a4a' } },
  qazi: { id: 'qazi', name: 'Qazi Sahab', avatar: { skin: '#b5835e', head: 'cap', beard: 'full', beardColor: '#e6e2da', outfit: '#f7f4ec', collar: '#3b3b3b' } },
  saali: { id: 'saali', name: `${B}'s Sisters`, avatar: { skin: '#d2a07c', hairStyle: 'long', hair: '#24160f', jewel: 'earrings', kajal: true, outfit: '#e9b8b5', dupatta: '#f7f0e1', lips: '#b4505a' } },
  brideAbbu: { id: 'brideAbbu', name: `${CONFIG.brideFather} Sahab`, avatar: { skin: '#b07c58', hairStyle: 'grey', hair: '#b9b4ac', beard: 'full', beardColor: '#bdb6aa', outfit: '#f5f2ea', collar: '#2f3f5a', glasses: true } },
  photographer: { id: 'photographer', name: 'Photographer Bhaiya', avatar: { skin: '#a8724f', hairStyle: 'short', hair: '#1d1410', outfit: '#2b2b2b', collar: '#444' } },
  pa: { id: 'pa', name: 'Cabin Announcement', avatar: null },
  narrator: { id: 'narrator', name: '', avatar: null },
};

export const SCRIPT = {
  prologue: {
    landing: ['Chaudhary Charan Singh International Airport, Lucknow', 'Monday · 22 March 2027'],
    pa: 'Ladies and gentlemen, welcome to Lucknow. Local time is 1:40 PM. To the groom in seat 14C, mubarak ho!',
    lines1: [
      ['groom', 'Lucknow… Two days to the Nikah. No pressure. Bilkul no pressure.'],
    ],
    call: [
      ['ammi', `${G}! Pahunch gaye? Seedha ghar aana, kahin rukna mat!`],
      ['groom', 'Ammi, abhi toh land hua hoon. Kichha 280 kilometre hai.'],
      ['ammi', 'Haan toh? Gaadi tez chalana… nahi nahi, dheere chalana! Aur Darau Chauraha se mithai lete aana.'],
      ['groom', 'Ji Ammi.'],
      ['groom', 'Tez bhi, dheere bhi, mithai bhi. Got it.'],
    ],
    map: [
      ['Lucknow', 'Engine on. Playlist: shaadi songs only.'],
      ['Sitapur', 'First chai stop. Kulhad, obviously.'],
      ['Shahjahanpur', `Best friend: "Bhai, sherwani trial ka video bhej!"`],
      ['Bareilly', 'Waving at the famous jhumka. Almost there.'],
      ['Baheri', 'Passing Blessing Garden. Day after tomorrow, this is where it happens…'],
      ['Kichha', 'Welcome home.'],
    ],
    arrive: 'Kichha, Uttarakhand · 5:50 PM',
  },
  ch1: {
    title: { date: CONFIG.dates.arrival, title: 'Ghar Wapsi', tag: 'Homecoming', place: 'Kichha, Uttarakhand' },
    objMithai: 'Pick up mithai at Darau Chauraha',
    objHome: 'Drive home via Azad Nagar. The family is waiting',
    toasts: [
      [0.08, 'baji', 'Ghar ki lights ON ho gayi hain. Wait till you see!'],
      [0.25, 'dost', 'Kichha pahunch gaya? Bachelor life ke last 48 hours, bhai!'],
      [0.45, 'ammi', 'Mithai li na? Ab Azad Nagar wale raaste se aana, seedha ghar.'],
      [0.85, 'baji', 'Gate pe sab khade hain. Smile ready rakho.'],
    ],
    mithai: [['groom', 'Bhaiya, Darau Chauraha ki famous mithai! Ek kilo barfi, ek kilo laddoo… aur ek dabba kaju katli. For bribing cousins.']],
    azad: ['Azad Nagar', 'Almost home. The lights should be visible soon.'],
    welcome: [
      ['ammi', 'Mashallah! Mera beta aa gaya. Nazar na lage!'],
      ['abbu', 'Safar kaisa raha, beta?'],
      ['groom', 'Abbu, 280 kilometre, teen chai, aur ek bahut nervous dulha.'],
      ['baji', `Kal Haldi hai, ${G}. Peela hone ke liye tayyar ho jao!`],
      ['groom', 'Mithai pehle. Negotiations baad mein.'],
    ],
    night: [
      ['dost', 'Bhai, kal se tu officially "dulha" hai. Kaisa lag raha hai?'],
      ['groom', `Ajeeb sa sukoon. ${B} ka message aaya: "Pahunch gaye? Safe drive?"`],
      ['dost', 'Aur tune kya kaha?'],
      ['groom', 'Maine kaha haan. Usne kaha: "Good. Kal Haldi mein bhaagna mat."'],
      ['cousins', 'Psst… pani ki baltiyan ready? …Ready.'],
      ['groom', 'Maine kuch suna?'],
      ['cousins', 'Kuch nahi! Good night, dulhe raja!'],
    ],
  },
  ch2: {
    title: { date: CONFIG.dates.haldi, title: 'Haldi', tag: 'A little yellow never hurt anyone', place: 'Home, Kichha' },
    intro: [
      ['ammi', 'Bismillah. Chehra chamakna chahiye Nikah ke din.'],
      ['khala', `Itna ubtan lagao ki ${B} pehchaan hi na paaye!`],
      ['baji', 'Rules simple hain: sabse haldi lagwao. Bhaagna mana hai.'],
      ['groom', 'Aur cousins ke paani se?'],
      ['baji', 'Uske liye… bas jhuk jaana.'],
    ],
    howto: 'Relatives come from the left, the front and the right. Turn to face them to receive haldi. When a cousin raises a water bucket, DUCK!',
    outro: [
      ['khala', 'Mashallah, bilkul sone jaisa!'],
      ['groom', 'Main sona nahi, main poora Haldiram ho gaya hoon.'],
      ['cousins', 'Aur ab… DANCE!'],
    ],
    night: [
      ['abbu', 'Beta, Nikah ek zimmedari hai, aur ek khoobsurat safar bhi.'],
      ['abbu', 'Izzat dena, sabr rakhna, aur hamesha baat karte rehna. Baat band, toh sab band.'],
      ['groom', 'Ji Abbu. Inshallah.'],
      ['abbu', 'Aur haan. Kal 11 baje Nikah hai. 9 baje tak tayyar. Matlab 8 baje tak.'],
    ],
  },
  ch3: {
    title: { date: CONFIG.dates.nikah, title: 'Sehra Bandi', tag: 'Dressed in ivory, crowned in flowers', place: 'Home, Kichha' },
    choose: 'Choose the look',
    tie: [
      ['mamu', 'Seedhe khade raho, dulhe raja. Sehra Mamu hi baandhte hain.'],
    ],
    tied: [
      ['baji', 'Ek kala tika… nazar na lage.'],
      ['ammi', 'Mashallah… mera beta. Allah har buri nazar se bachaye.'],
      ['groom', 'Ammi, ro mat. Mascara phail jayega.'],
      ['ammi', 'Main mascara lagati hi nahi!'],
      ['abbu', 'Chalo, baraat nikalne ka waqt ho gaya. 11 baje ka Nikah hai!'],
    ],
    driveObj: 'Lead the baraat to Blessing Garden, Baheri',
    toasts: [
      [0.06, 'dost', 'Convoy peeche hai. Humein kho mat dena!'],
      [0.3, 'saali', 'Jiju, gate pe rasta rokne wale hain hum. Neg ready rakhna!'],
      [0.55, 'ammi', 'Aaram se chalana. Sehra theek hai na?'],
      [0.8, 'dost', 'Band-baaja venue ke paas ready hai. Ghodi bhi!'],
    ],
    ffHint: 'Hold F (or ⏩) to fast-forward the drive',
    ghodi: [
      ['dost', 'Gaadi yahin. Ab dulha ghodi pe jaayega!'],
      ['groom', 'Yaar, ghodi ne mujhe aise kyun dekha?'],
      ['dost', 'Woh bhi nervous hai. Chal, dhol bajao!'],
    ],
    rhythmHow: 'Hit the beats when the gold rings meet the centre. Keep the baraat dancing all the way to the gate!',
    gate: [
      ['saali', 'Rukiye, rukiye! Rasta band hai. Pehle neg, phir entry!'],
    ],
    gateChoices: ['₹ 5,100', '₹ 11,000', 'Ek gaana sunaunga'],
    gateReplies: [
      [['saali', 'Paanch hazaar? Jiju, itna toh chocolate ka budget hai!'], ['groom', 'Theek hai, theek hai… ₹ 11,000.']],
      [['saali', 'Hmm… ₹ 11,000 aur ek promise: Didi ko hamesha khush rakhoge.'], ['groom', 'Promise. Pakka promise.']],
      [['groom', '♪ Mere haath mein tera haath ho… ♪'], ['saali', 'Bas bas! Yeh lo entry, gaana mat gaao!']],
    ],
  },
  nikah: {
    title: { date: CONFIG.dates.nikah, title: 'Nikah', tag: 'Two hearts, one promise', place: 'Blessing Garden, Baheri · 11:00 AM' },
    intro: [
      ['qazi', 'Assalam-o-alaikum. Gawah maujood hain, families maujood hain. Shuru karte hain.'],
    ],
    ask: (n) => `${CONFIG.groomFull}, son of ${CONFIG.groomFather}: do you accept ${CONFIG.brideFull}, daughter of ${CONFIG.brideFather}, in Nikah?`,
    howQubool: 'When the ring glows gold, say it. Press Space or tap.',
    qubool: ['Qubool hai.', 'Qubool hai.', 'Qubool hai!'],
    signHow: 'Sign the nikahnama: trace the golden flourish',
    mubarak: [
      ['qazi', 'Nikah mubarak ho!'],
      ['cousins', 'MUBARAK HO!'],
    ],
    chhuareHow: 'Chhuare shower! Catch the dried dates (← →)',
    joota: [
      ['saali', 'Jiju… aapke joote kahan gaye? Hehe.'],
      ['groom', 'Mere joote! Woh toh yahin the!'],
      ['saali', 'Joote chahiye toh neg dena padega. Shuru karte hain ₹ 51,000 se.'],
    ],
    jootaRounds: [
      { offer: 'Shuru karte hain ₹ 51,000 se.', choices: ['₹ 5,000', '₹ 11,000', 'Dost ko bhejo'], replies: ['Paanch? Jiju, joote ka polish bhi nahi aayega!', 'Gyarah? Chalo, ₹ 31,000.', 'Dost: "Bhai main toh khud inke saath hoon." Traitor!'] },
      { offer: '₹ 31,000. Last offer… shayad.', choices: ['₹ 15,000', '₹ 21,000 + chocolates', 'Ammi ko bulata hoon'], replies: ['Pandrah? Hmm… nahi.', 'Chocolates?! …Deal!', 'Ammi: "Beta, de do." Ammi bhi unki side!'] },
    ],
    jootaDone: [['saali', 'Deal! Yeh lo aapke joote. Aur yeh doodh. Peeyo, phir neg ka baaki hissa!'], ['groom', 'Doodh pilai bhi?! Yeh toh robbery hai.'], ['saali', 'Welcome to the family, Jiju!']],
    rukhsati: [
      ['brideAbbu', `Beta, hamari ${B} ab aapki amanat hai.`],
      ['groom', 'Main hamesha uska khayal rakhunga. Aapka bharosa kabhi nahi todunga.'],
      ['bride', 'Chaliye… ghar chalte hain.'],
    ],
  },
  walima: {
    title: { date: CONFIG.dates.walima, title: 'Walima', tag: 'An evening of gratitude', place: 'Grand Heritage, Kichha · 7:00 PM' },
    obj: 'Drive to Grand Heritage with ' + B,
    toasts: [
      [0.1, 'brideWalima', `${G}, dheere! Mera dupatta…`],
      [0.4, 'groomWalima', 'Kitne log aa rahe hain aaj?'],
      [0.45, 'brideWalima', 'Bas aath sau. Aur sabko photo chahiye.'],
      [0.75, 'dost', 'Stage ready hai. Khana bhi. Mamu pehle se line mein hain.'],
    ],
    arrive: [
      ['brideWalima', 'Yeh lights… bilkul hamare card jaisi.'],
      ['groomWalima', 'Card bhi tumhara idea tha. Sab kuch tumhara idea tha.'],
      ['brideWalima', 'Aur tum? Tum kiska idea the?'],
      ['groomWalima', 'Allah ka. Best idea.'],
    ],
    photoHow: 'Guests come up for photos. Tap when the gold ring meets the frame for the perfect shot!',
    guests: [
      ['khala', 'Mashallah, kitni pyaari jodi! Ab jaldi se…'],
      ['mamu', 'Photo jaldi khinchao, khana khul gaya hai.'],
      ['dost', 'Bhai, ab tu gaya. Officially.'],
      ['baji', 'Meri bhabhi sabse sundar! Aur bhai… theek-thaak.'],
      ['cousins', 'Haldi wala revenge abhi baaki hai!'],
      ['abbu', 'Bas aise hi muskurate rehna. Hamesha.'],
      ['ammi', 'Dono ko meri umar lag jaaye.'],
      ['saali', 'Jiju, neg ka baaki hissa kab?'],
    ],
  },
  epilogue: {
    verse: '“And among His signs is that He created for you mates from among yourselves, that you may dwell in tranquillity with them, and He has put love and mercy between your hearts.”',
    verseRef: '— Surah Ar-Rum (30:21)',
    thanks: 'Your presence is the blessing we seek',
  },
};
