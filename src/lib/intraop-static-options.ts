import type { ClinicalStringKey } from "./preferences-context"

export const COMPLICATION_TC_TITLES: Record<string, ClinicalStringKey> = {
  cardiovascular: "compCatCardiovascular",
  respiratory: "compCatRespiratory",
  neurological: "compCatNeurological",
  metabolic: "compCatMetabolic",
  drug: "compCatDrug",
  haematological: "compCatHaematological",
  equipment: "compCatEquipment",
  surgical: "compCatSurgical",
}

export const COMPLICATION_GROUPS = [
  {
    id: "cardiovascular",
    title: "Cardiovascular",
    items: [
      "Hypotension", "Hypertension", "Bradycardia", "Tachycardia",
      "Atrial fibrillation", "Supraventricular arrhythmia", "Ventricular tachycardia",
      "Ventricular fibrillation", "Myocardial ischaemia", "Myocardial infarction",
      "Cardiac arrest", "Venous air embolism", "Pulmonary embolism", "ST changes",
    ],
  },
  {
    id: "respiratory",
    title: "Respiratory",
    items: [
      "Hypoxia / desaturation", "Laryngospasm", "Bronchospasm", "Aspiration",
      "Difficult intubation", "Failed intubation", "CICO (can't intubate can't oxygenate)",
      "Accidental extubation", "Endobronchial intubation",
      "Pneumothorax", "Tension pneumothorax", "Hypercarbia",
    ],
  },
  {
    id: "neurological",
    title: "Neurological",
    items: [
      "Awareness under anaesthesia", "Cerebrovascular accident / stroke",
      "Raised intracranial pressure", "Peripheral nerve injury",
      "Spinal cord ischaemia", "Total spinal",
      "Delayed emergence", "Seizure", "High spinal", "Failed block",
    ],
  },
  {
    id: "metabolic",
    title: "Metabolic / Temperature",
    items: [
      "Hypothermia", "Hyperthermia", "Malignant hyperthermia",
      "Hypoglycaemia", "Hyperglycaemia",
      "Hyponatraemia", "Hypernatraemia", "Hypokalaemia", "Hyperkalaemia",
      "Hypocalcaemia", "Adrenal crisis",
    ],
  },
  {
    id: "drug",
    title: "Drug / Pharmacological",
    items: [
      "Anaphylaxis / allergic reaction", "Anaphylactoid reaction", "Drug reaction", "Latex reaction",
      "Drug error", "Drug overdose",
      "Local anaesthetic systemic toxicity (LAST)",
      "Residual neuromuscular blockade", "Serotonin syndrome",
    ],
  },
  {
    id: "haematological",
    title: "Haematological",
    items: [
      "Massive haemorrhage", "Blood loss >1L", "Coagulopathy",
      "DIC (disseminated intravascular coagulation)",
      "Haemolytic transfusion reaction", "Febrile non-haemolytic transfusion reaction",
      "TRALI (transfusion-related acute lung injury)",
      "TACO (transfusion-associated circulatory overload)",
    ],
  },
  {
    id: "equipment",
    title: "Equipment / Technical",
    items: [
      "IV line failure / extravasation", "Arterial line failure", "CVK failure",
      "ETT displacement", "Circuit disconnection", "Gas supply failure",
      "Monitoring failure", "Regional block failure", "Equipment malfunction",
    ],
  },
  {
    id: "surgical",
    title: "Surgical",
    items: [
      "Unexpected major haemorrhage", "Injury to major vessel", "Injury to organ",
      "Tourniquet complication", "Pneumoperitoneum complication",
      "Positioning injury", "Compartment syndrome", "Venous gas embolism",
    ],
  },
]

export const PREMED_QUICK = [
  "Midazolam 7.5 mg PO",
  "Midazolam 3.75 mg PO",
  "Temazepam 10 mg PO",
  "Lorazepam 1 mg PO",
  "Hydroxyzine 25 mg PO",
  "Omeprazole 20 mg PO",
  "Metoclopramide 10 mg PO",
  "Ondansetron 4 mg PO",
  "Paracetamol 1g PO",
  "Clonidine 0.1 mg PO",
]
