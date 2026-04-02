import {
  createInitialTeeth,
  type Mobility,
  type Surface,
  type SurfaceCondition,
  type ToothLabel,
  type ToothState,
  type VoiceLogEntry,
} from "../data/dental";

interface SeedTooth {
  number: number;
  labels?: ToothLabel[];
  surfaces?: Partial<Record<Surface, SurfaceCondition>>;
  mobility?: Mobility;
  note?: string;
}

interface SeedSession {
  id: string;
  status: "active" | "completed";
  summary: string | null;
  sessionNotes: string | null;
  createdAt: string;
  completedAt: string | null;
  teeth: SeedTooth[];
  voiceLog: VoiceLogEntry[];
}

interface SeedPatient {
  id: string;
  name: string;
  dateOfBirth: string;
  notes: string;
  createdAt: string;
  sessions: SeedSession[];
}

function buildTeeth(seedTeeth: SeedTooth[]): ToothState[] {
  const teeth = createInitialTeeth();

  for (const seedTooth of seedTeeth) {
    const index = teeth.findIndex((tooth) => tooth.number === seedTooth.number);
    if (index === -1) continue;

    teeth[index] = {
      ...teeth[index],
      labels: seedTooth.labels ?? [],
      surfaces: seedTooth.surfaces ?? {},
      mobility: seedTooth.mobility ?? "none",
      note: seedTooth.note,
    };
  }

  return teeth;
}

function logEntry(
  id: string,
  timestamp: string,
  transcript: string,
  parsed: string,
  type: VoiceLogEntry["type"] = "command",
): VoiceLogEntry {
  return {
    id,
    timestamp,
    transcript,
    parsed,
    type,
  };
}

function noteText(lines: string[]): string {
  return lines.join("\n");
}

const DEMO_PATIENTS: SeedPatient[] = [
  {
    id: "demo-patient-sofia-martinez",
    name: "Sofia Martinez",
    dateOfBirth: "1991-04-12",
    notes: noteText([
      "Past Medical History: Denies chronic medical conditions.",
      "Past Surgical History: Denies.",
      "Medications: Combined oral contraceptive; ibuprofen 400 mg as needed for headaches.",
      "Allergies: Denies medication allergies.",
      "Smoking: Denies.",
      "ETOH: Wine socially, approximately 1 to 2 glasses per week.",
      "Other Drugs: Denies.",
      "General Appearance: Appears well in general.",
      "Patient preferences: Prefers conservative care and appreciates a short spoken summary before treatment starts.",
    ]),
    createdAt: "2025-12-03T13:45:00.000Z",
    sessions: [
      {
        id: "demo-session-sofia-baseline",
        status: "completed",
        summary:
          "Baseline visit recorded active caries on tooth 26 MO and tooth 36 O, mild mobility on 31, and an existing vestibular composite on 11. Patient reported cold sensitivity in the upper left.",
        sessionNotes: noteText([
          "History of Present Illness: Cold sensitivity on the upper left was first noticed approximately 6 weeks before the visit. Pain was described as sharp, 5/10, triggered by iced water and sweets, and relieved when the stimulus was removed. No spontaneous night pain, facial swelling, fever, or radiation to the ear or temple. The patient had not undergone outside imaging or prior treatment for this episode.",
          "Head and Neck:",
          "- No facial swelling or asymmetry.",
          "- No cervical LAD or palpable neck masses.",
          "Intra-Oral:",
          "- FOM soft and non-elevated.",
          "- Uvula midline and oropharynx clear.",
          "- Heavy plaque retention around posterior contacts, especially near 26 and 36.",
          "- No vestibular swelling, no drainage, and no suspicious mucosal lesions.",
          "Discussion with patient: Reviewed likely carious etiology of the cold sensitivity and explained that teeth 26 and 36 would likely require conservative restorations. Oral hygiene, interdental cleaning, and fluoride exposure were discussed in detail.",
          "Impression: 34F with symptomatic mesio-occlusal caries on 26 and occlusal caries on 36, mild mobility of 31, and plaque-associated cold sensitivity without signs of acute odontogenic infection.",
          "Plan:",
          "1. Restore tooth 26 MO and tooth 36 O with direct composite if restorable after caries excavation.",
          "2. Begin nightly fluoride toothpaste use and improve floss/interdental brush routine around posterior contacts.",
          "3. Re-evaluate mobility of tooth 31 at follow-up after periodontal debridement and occlusal review.",
          "4. Return sooner for spontaneous pain, swelling, or prolonged sensitivity.",
        ]),
        createdAt: "2025-12-03T14:00:00.000Z",
        completedAt: "2025-12-03T14:28:00.000Z",
        teeth: [
          {
            number: 26,
            surfaces: { M: "caries", O: "caries" },
            note: "Food packing and cold sensitivity near the mesial contact.",
          },
          {
            number: 36,
            surfaces: { O: "caries" },
            note: "Occlusal cavitation visible on drying.",
          },
          {
            number: 31,
            mobility: "M1",
            note: "Localized lower incisor mobility, monitor at recall.",
          },
          {
            number: 11,
            surfaces: { V: "composite" },
            note: "Existing vestibular composite remains intact.",
          },
        ],
        voiceLog: [
          logEntry(
            "log-sofia-baseline-1",
            "00:02",
            "Tooth twenty-six caries on mesial and occlusal.",
            "Tooth 26, caries on MO registered.",
          ),
          logEntry(
            "log-sofia-baseline-2",
            "00:05",
            "Tooth thirty-six decay on occlusal.",
            "Tooth 36, caries on O registered.",
          ),
          logEntry(
            "log-sofia-baseline-3",
            "00:08",
            "Thirty-one mobility grade one.",
            "Tooth 31, mobility M1 registered.",
          ),
          logEntry(
            "log-sofia-baseline-4",
            "00:10",
            "Tooth eleven existing composite on vestibular.",
            "Tooth 11, composite on V registered.",
          ),
          logEntry(
            "log-sofia-baseline-5",
            "00:14",
            "Session note patient reports cold sensitivity on the upper left when drinking iced water.",
            "Session note added: patient reports cold sensitivity on the upper left when drinking iced water.",
          ),
          logEntry(
            "log-sofia-baseline-6",
            "00:19",
            "What do we have so far?",
            "Summary requested",
          ),
        ],
      },
      {
        id: "demo-session-sofia-restorative",
        status: "completed",
        summary:
          "Restorative visit completed with composite restorations on 26 MO and 36 O. Tooth 11 vestibular composite remains stable, and the patient reported marked improvement in sensitivity.",
        sessionNotes: noteText([
          "History of Present Illness: Patient returned for planned restorative care after the baseline exam. Cold sensitivity had persisted intermittently but was less intense than at the initial visit. No spontaneous pain, swelling, or analgesic use was reported before treatment.",
          "Intra-Oral:",
          "- No soft tissue swelling or fluctuant areas adjacent to the symptomatic teeth.",
          "- Carious lesions on 26 MO and 36 O remained localized and restorable clinically.",
          "Discussion with patient: Risks, benefits, and alternatives of direct composite restorations versus delayed treatment were reviewed. The patient elected same-day conservative restorative treatment and tolerated the procedure well.",
          "Impression: 34F status post conservative restorative treatment of teeth 26 and 36 with improving cold sensitivity and no evidence of pulpal or soft-tissue complications.",
          "Plan:",
          "1. Monitor post-operative sensitivity for 1 to 2 weeks; advise the patient to call if pain becomes spontaneous or lingering.",
          "2. Continue fluoride toothpaste and improved interdental hygiene.",
          "3. Maintain observation of tooth 31 mobility at review.",
          "4. Schedule short-term review to confirm symptom resolution and restoration stability.",
        ]),
        createdAt: "2026-01-17T09:00:00.000Z",
        completedAt: "2026-01-17T09:24:00.000Z",
        teeth: [
          {
            number: 26,
            surfaces: { M: "composite", O: "composite" },
            note: "Direct composite placed after caries removal. Sensitivity improved.",
          },
          {
            number: 36,
            surfaces: { O: "composite" },
            note: "Occlusal composite polished and in occlusal harmony.",
          },
          {
            number: 11,
            surfaces: { V: "composite" },
            note: "Existing anterior composite unchanged and esthetically acceptable.",
          },
        ],
        voiceLog: [
          logEntry(
            "log-sofia-restorative-1",
            "00:03",
            "Tooth twenty-six composite on mesial and occlusal.",
            "Tooth 26, composite on MO registered.",
          ),
          logEntry(
            "log-sofia-restorative-2",
            "00:06",
            "Tooth thirty-six composite on occlusal.",
            "Tooth 36, composite on O registered.",
          ),
          logEntry(
            "log-sofia-restorative-3",
            "00:09",
            "Session note patient says the cold sensitivity is much better after treatment.",
            "Session note added: patient says the cold sensitivity is much better after treatment.",
          ),
          logEntry(
            "log-sofia-restorative-4",
            "00:12",
            "Read back the main findings.",
            "Summary requested",
          ),
        ],
      },
      {
        id: "demo-session-sofia-review",
        status: "completed",
        summary:
          "Review appointment showed stable composite restorations on teeth 26 and 36 with no recurrent caries. Patient remained asymptomatic and oral hygiene had improved substantially.",
        sessionNotes: noteText([
          "History of Present Illness: Six-week review after composite restorations on 26 and 36. The patient denied residual cold sensitivity, chewing pain, or food impaction and reported better brushing and flossing consistency since the prior visits.",
          "General Appearance: Appears well in general.",
          "Intra-Oral:",
          "- Restorations on 26 and 36 intact with acceptable occlusion and margins.",
          "- Plaque levels improved compared with the baseline visit.",
          "- No recurrent caries, no percussion tenderness, and no localized swelling.",
          "Discussion with patient: Reinforced that current restorations are stable and discussed the importance of maintaining posterior interdental cleaning to reduce recurrence risk.",
          "Impression: 34F with stable composite restorations on 26 and 36, resolved sensitivity, and improved oral hygiene after conservative treatment.",
          "Plan:",
          "1. Continue current home care and fluoride toothpaste use.",
          "2. Routine hygiene and recall exam in 6 months.",
          "3. Reassess tooth 31 mobility at the next periodic visit.",
        ]),
        createdAt: "2026-03-21T10:10:00.000Z",
        completedAt: "2026-03-21T10:32:00.000Z",
        teeth: [
          {
            number: 26,
            surfaces: { M: "composite", O: "composite" },
            note: "Margins intact. No percussion sensitivity.",
          },
          {
            number: 36,
            surfaces: { O: "composite" },
            note: "Restoration stable with improved plaque control.",
          },
          {
            number: 11,
            surfaces: { V: "composite" },
          },
        ],
        voiceLog: [
          logEntry(
            "log-sofia-review-1",
            "00:04",
            "Tooth twenty-six composite mesial occlusal remains stable.",
            "Tooth 26, composite on MO registered.",
          ),
          logEntry(
            "log-sofia-review-2",
            "00:07",
            "Tooth thirty-six occlusal composite stable.",
            "Tooth 36, composite on O registered.",
          ),
          logEntry(
            "log-sofia-review-3",
            "00:11",
            "General note no pain today and hygiene is much better.",
            "Session note added: no pain today and hygiene is much better.",
          ),
        ],
      },
    ],
  },
  {
    id: "demo-patient-daniel-kim",
    name: "Daniel Kim",
    dateOfBirth: "1985-09-30",
    notes: noteText([
      "Past Medical History: Mild essential hypertension, well controlled. Denies diabetes, anticoagulation, or cardiac history.",
      "Past Surgical History: Appendectomy in adolescence. No reported complications with anesthesia.",
      "Medications: Lisinopril 10 mg daily; occasional OTC ibuprofen.",
      "Allergies: Denies medication allergies.",
      "Smoking: Former cigarette smoker, approximately 0.5 pack/day for 12 years (6 pack-years), quit 3 years ago.",
      "ETOH: Beer socially, about 2 to 3 drinks per week.",
      "Other Drugs: Denies.",
      "General Appearance: Appears well in general.",
      "Behavioral context: Works night shifts, postpones recall visits, and has visible parafunctional wear consistent with bruxism risk.",
    ]),
    createdAt: "2026-02-05T14:40:00.000Z",
    sessions: [
      {
        id: "demo-session-daniel-initial",
        status: "completed",
        summary:
          "Initial review documented an implant on 46, missing 47, an existing crown on 14 with an open contact, cervical composite on 33, and mobility M2 on 31. Bruxism-related wear facets were noted.",
        sessionNotes: noteText([
          "History of Present Illness: Lower anterior soreness had been noticed for roughly 3 months, worse when chewing firm foods late in the day and on waking after overnight clenching. The patient described a dull pressure sensation, 4/10, without radiation, swelling, or thermal sensitivity. No outside imaging or urgent care visits were reported.",
          "Head and Neck:",
          "- No facial swelling, no cervical LAD, and no TMJ locking.",
          "- Mild masseter tenderness on palpation consistent with parafunctional loading.",
          "Intra-Oral:",
          "- Generalized wear facets on the anterior dentition.",
          "- Existing crown on 14 with open distal contact and food trapping history.",
          "- Implant restoration on 46 stable; 47 absent.",
          "Discussion with patient: Explained that lower incisor mobility and soreness are likely multifactorial, with nocturnal bruxism and occlusal overload playing a major role. Reviewed the need to protect the lower incisors and monitor the implant and crown sites.",
          "Impression: 40M with probable nocturnal bruxism, mobility M2 of tooth 31, stable implant at 46, missing 47, and a food-trapping contact issue around the existing crown on 14.",
          "Plan:",
          "1. Recommend occlusal guard evaluation and conservative occlusal adjustment as indicated.",
          "2. Monitor tooth 31 mobility after load reduction and reinforce avoidance of parafunctional habits.",
          "3. Review contact around 14 and consider adjustment if food trapping persists.",
          "4. Recall in 4 to 6 weeks to assess symptom change.",
        ]),
        createdAt: "2026-02-05T15:00:00.000Z",
        completedAt: "2026-02-05T15:26:00.000Z",
        teeth: [
          {
            number: 14,
            labels: ["crown"],
            note: "Open distal contact around existing crown.",
          },
          {
            number: 46,
            labels: ["implant"],
            note: "Implant crown in function with healthy soft tissue contour.",
          },
          {
            number: 47,
            labels: ["missing"],
          },
          {
            number: 31,
            mobility: "M2",
            note: "Lower incisor mobility increases on lateral excursion.",
          },
          {
            number: 33,
            surfaces: { V: "composite" },
            note: "Cervical composite intact with mild marginal staining.",
          },
        ],
        voiceLog: [
          logEntry(
            "log-daniel-initial-1",
            "00:03",
            "Tooth fourteen crown.",
            "Tooth 14, crown registered.",
          ),
          logEntry(
            "log-daniel-initial-2",
            "00:06",
            "Tooth forty-six implant. Tooth forty-seven missing.",
            "Tooth 46, implant registered.",
          ),
          logEntry(
            "log-daniel-initial-3",
            "00:07",
            "Tooth forty-six implant. Tooth forty-seven missing.",
            "Tooth 47, missing registered.",
          ),
          logEntry(
            "log-daniel-initial-4",
            "00:10",
            "Thirty-one mobility grade two.",
            "Tooth 31, mobility M2 registered.",
          ),
          logEntry(
            "log-daniel-initial-5",
            "00:13",
            "Session note likely bruxism with soreness on chewing lower incisors.",
            "Session note added: likely bruxism with soreness on chewing lower incisors.",
          ),
        ],
      },
      {
        id: "demo-session-daniel-followup",
        status: "completed",
        summary:
          "Follow-up after occlusal adjustment showed reduced lower incisor discomfort and mobility improved from M2 to M1. Existing crown, implant, and cervical composite remained stable.",
        sessionNotes: noteText([
          "History of Present Illness: Follow-up after occlusal adjustment. The patient reported less soreness during chewing and less morning pressure across the lower incisors. No new swelling, mobility complaints, or implant-related symptoms were described.",
          "Intra-Oral:",
          "- Mobility of tooth 31 improved from prior visit and now clinically closer to M1.",
          "- Crown on 14 no longer trapping food according to the patient.",
          "- Implant-supported restoration on 46 remains stable and non-tender.",
          "Discussion with patient: Reviewed early improvement after occlusal adjustment and emphasized that a protective night guard would still be recommended if clenching continues.",
          "Impression: 40M with improving lower incisor symptoms and reduced mobility after occlusal adjustment, with otherwise stable existing restorations and implant support.",
          "Plan:",
          "1. Continue monitoring tooth 31 mobility at the next review.",
          "2. Recommend night guard fabrication if parafunctional symptoms recur.",
          "3. Maintain routine hygiene and periodic review around the implant and crown.",
        ]),
        createdAt: "2026-03-11T13:40:00.000Z",
        completedAt: "2026-03-11T14:02:00.000Z",
        teeth: [
          {
            number: 14,
            labels: ["crown"],
            note: "Contact adjusted and no food trapping reported.",
          },
          {
            number: 46,
            labels: ["implant"],
          },
          {
            number: 47,
            labels: ["missing"],
          },
          {
            number: 31,
            mobility: "M1",
            note: "Improved after occlusal adjustment.",
          },
          {
            number: 33,
            surfaces: { V: "composite" },
          },
        ],
        voiceLog: [
          logEntry(
            "log-daniel-followup-1",
            "00:04",
            "Thirty-one mobility grade one today.",
            "Tooth 31, mobility M1 registered.",
          ),
          logEntry(
            "log-daniel-followup-2",
            "00:08",
            "General note patient reports less discomfort after the occlusal adjustment.",
            "Session note added: patient reports less discomfort after the occlusal adjustment.",
          ),
        ],
      },
    ],
  },
  {
    id: "demo-patient-elena-ruiz",
    name: "Elena Ruiz",
    dateOfBirth: "1994-02-18",
    notes: noteText([
      "Past Medical History: Second trimester pregnancy, otherwise denies significant medical history.",
      "Past Surgical History: Denies.",
      "Medications: Prenatal vitamin daily; ferrous sulfate 325 mg daily.",
      "Allergies: Amoxicillin causes rash.",
      "Smoking: Denies.",
      "ETOH: Denies during pregnancy.",
      "Other Drugs: Denies.",
      "General Appearance: Appears well in general.",
      "Patient preferences: Preventive-minded and prefers minimal intervention with short, clearly planned appointments.",
    ]),
    createdAt: "2026-03-28T08:10:00.000Z",
    sessions: [
      {
        id: "demo-session-elena-review",
        status: "completed",
        summary:
          "Preventive review identified an early mesial carious lesion on 22, stable root canal treated crown on 27, existing occlusal amalgam on 37, and missing 48. No spontaneous pain reported.",
        sessionNotes: noteText([
          "History of Present Illness: The patient presented for a preventive review and denied spontaneous pain. She noted occasional brief food sensitivity between the upper left premolars and incisors over the prior month but no lingering thermal pain, swelling, or sleep disturbance. No recent outside dental imaging was performed.",
          "Head and Neck:",
          "- No facial asymmetry, no cervical LAD, and no extraoral swelling.",
          "Intra-Oral:",
          "- FOM soft and non-elevated; uvula midline; oropharynx clear.",
          "- Early mesial lesion evident on 22 without cavitation into dentin clinically.",
          "- Existing crown/RCT on 27 and occlusal amalgam on 37 appear stable.",
          "- No suspicious mucosal lesions and no vestibular swelling.",
          "Discussion with patient: Because the patient is pregnant and asymptomatic, we discussed a conservative, prevention-focused approach with close monitoring, localized fluoride measures, and short appointments if restorative treatment becomes necessary.",
          "Impression: 32F in the second trimester of pregnancy with early mesial caries on 22, stable endodontically treated/crowned tooth 27, stable amalgam on 37, and missing 48, currently without acute odontogenic symptoms.",
          "Plan:",
          "1. Recommend localized fluoride varnish and reinforced proximal plaque control around tooth 22.",
          "2. Obtain interval radiographic review at an appropriate follow-up if symptoms progress or lesion activity increases.",
          "3. Continue observation of teeth 27 and 37 as currently stable.",
          "4. Maintain short preventive recall visits during pregnancy and re-evaluate definitive restorative timing with the patient.",
        ]),
        createdAt: "2026-03-28T08:30:00.000Z",
        completedAt: "2026-03-28T08:55:00.000Z",
        teeth: [
          {
            number: 22,
            surfaces: { M: "caries" },
            note: "Incipient lesion visible radiographically at the contact area.",
          },
          {
            number: 27,
            labels: ["rct", "crown"],
            note: "Asymptomatic endodontically treated tooth with stable crown margins.",
          },
          {
            number: 37,
            surfaces: { O: "amalgam" },
            note: "Existing occlusal amalgam remains serviceable.",
          },
          {
            number: 48,
            labels: ["missing"],
          },
        ],
        voiceLog: [
          logEntry(
            "log-elena-review-1",
            "00:03",
            "Tooth twenty-two caries on mesial.",
            "Tooth 22, caries on M registered.",
          ),
          logEntry(
            "log-elena-review-2",
            "00:06",
            "Tooth twenty-seven root canal treatment and crown.",
            "Tooth 27, rct and crown registered.",
          ),
          logEntry(
            "log-elena-review-3",
            "00:09",
            "Tooth thirty-seven amalgam on occlusal.",
            "Tooth 37, amalgam on O registered.",
          ),
          logEntry(
            "log-elena-review-4",
            "00:11",
            "Tooth forty-eight missing.",
            "Tooth 48, missing registered.",
          ),
          logEntry(
            "log-elena-review-5",
            "00:15",
            "Session note patient is pregnant and prefers short conservative appointments.",
            "Session note added: patient is pregnant and prefers short conservative appointments.",
          ),
        ],
      },
    ],
  },
];

let demoSeedPromise: Promise<void> | null = null;

export async function seedDemoData(env: Env): Promise<void> {
  if (demoSeedPromise) return demoSeedPromise;

  demoSeedPromise = (async () => {
    for (const patient of DEMO_PATIENTS) {
      await env.DB.prepare(
        "INSERT INTO patients (id, name, date_of_birth, notes, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, date_of_birth = excluded.date_of_birth, notes = excluded.notes, created_at = excluded.created_at",
      )
        .bind(
          patient.id,
          patient.name,
          patient.dateOfBirth,
          patient.notes,
          patient.createdAt,
        )
        .run();

      for (const session of patient.sessions) {
        await env.DB.prepare(
          "INSERT INTO sessions (id, patient_id, status, summary, session_notes, teeth_data, voice_log, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET patient_id = excluded.patient_id, status = excluded.status, summary = excluded.summary, session_notes = excluded.session_notes, teeth_data = excluded.teeth_data, voice_log = excluded.voice_log, created_at = excluded.created_at, completed_at = excluded.completed_at",
        )
          .bind(
            session.id,
            patient.id,
            session.status,
            session.summary,
            session.sessionNotes,
            JSON.stringify(buildTeeth(session.teeth)),
            JSON.stringify(session.voiceLog),
            session.createdAt,
            session.completedAt,
          )
          .run();
      }
    }
  })().catch((err) => {
    demoSeedPromise = null;
    throw err;
  });

  return demoSeedPromise;
}
