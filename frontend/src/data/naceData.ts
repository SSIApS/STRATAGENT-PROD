/**
 * NACE Rev. 2 reference data — Sections and Divisions
 * Used for industry targeting in STRATAGENT Knowledge Base.
 * Source: Eurostat NACE Rev. 2 classification
 */

export interface NaceEntry {
  code: string
  label: string
  level: 'section' | 'division'
  sectionCode: string
  sectionLabel: string
}

export const NACE_DATA: NaceEntry[] = [
  // ── Section A ──────────────────────────────────────────────────────────────
  { code: 'A',   label: 'Agriculture, Forestry and Fishing',                                  level: 'section',  sectionCode: 'A', sectionLabel: 'Agriculture, Forestry and Fishing' },
  { code: 'A01', label: 'Crop and animal production, hunting and related service activities', level: 'division', sectionCode: 'A', sectionLabel: 'Agriculture, Forestry and Fishing' },
  { code: 'A02', label: 'Forestry and logging',                                               level: 'division', sectionCode: 'A', sectionLabel: 'Agriculture, Forestry and Fishing' },
  { code: 'A03', label: 'Fishing and aquaculture',                                            level: 'division', sectionCode: 'A', sectionLabel: 'Agriculture, Forestry and Fishing' },

  // ── Section B ──────────────────────────────────────────────────────────────
  { code: 'B',   label: 'Mining and Quarrying',                            level: 'section',  sectionCode: 'B', sectionLabel: 'Mining and Quarrying' },
  { code: 'B05', label: 'Mining of coal and lignite',                      level: 'division', sectionCode: 'B', sectionLabel: 'Mining and Quarrying' },
  { code: 'B06', label: 'Extraction of crude petroleum and natural gas',   level: 'division', sectionCode: 'B', sectionLabel: 'Mining and Quarrying' },
  { code: 'B07', label: 'Mining of metal ores',                            level: 'division', sectionCode: 'B', sectionLabel: 'Mining and Quarrying' },
  { code: 'B08', label: 'Other mining and quarrying',                      level: 'division', sectionCode: 'B', sectionLabel: 'Mining and Quarrying' },
  { code: 'B09', label: 'Mining support service activities',               level: 'division', sectionCode: 'B', sectionLabel: 'Mining and Quarrying' },

  // ── Section C ──────────────────────────────────────────────────────────────
  { code: 'C',   label: 'Manufacturing',                                                               level: 'section',  sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C10', label: 'Manufacture of food products',                                               level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C11', label: 'Manufacture of beverages',                                                   level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C12', label: 'Manufacture of tobacco products',                                            level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C13', label: 'Manufacture of textiles',                                                    level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C14', label: 'Manufacture of wearing apparel',                                             level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C15', label: 'Manufacture of leather and related products',                                level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C16', label: 'Manufacture of wood and wood products (excl. furniture)',                    level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C17', label: 'Manufacture of paper and paper products',                                    level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C18', label: 'Printing and reproduction of recorded media',                                level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C19', label: 'Manufacture of coke and refined petroleum products',                         level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C20', label: 'Manufacture of chemicals and chemical products',                             level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C21', label: 'Manufacture of basic pharmaceutical products and preparations',              level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C22', label: 'Manufacture of rubber and plastic products',                                 level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C23', label: 'Manufacture of other non-metallic mineral products',                         level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C24', label: 'Manufacture of basic metals',                                                level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C25', label: 'Manufacture of fabricated metal products (excl. machinery and equipment)',   level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C26', label: 'Manufacture of computer, electronic and optical products',                   level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C27', label: 'Manufacture of electrical equipment',                                        level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C28', label: 'Manufacture of machinery and equipment n.e.c.',                              level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C29', label: 'Manufacture of motor vehicles, trailers and semi-trailers',                  level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C30', label: 'Manufacture of other transport equipment',                                   level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C31', label: 'Manufacture of furniture',                                                   level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C32', label: 'Other manufacturing',                                                        level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },
  { code: 'C33', label: 'Repair and installation of machinery and equipment',                         level: 'division', sectionCode: 'C', sectionLabel: 'Manufacturing' },

  // ── Section D ──────────────────────────────────────────────────────────────
  { code: 'D',   label: 'Electricity, Gas, Steam and Air Conditioning Supply',  level: 'section',  sectionCode: 'D', sectionLabel: 'Electricity, Gas, Steam and Air Conditioning Supply' },
  { code: 'D35', label: 'Electricity, gas, steam and air conditioning supply',  level: 'division', sectionCode: 'D', sectionLabel: 'Electricity, Gas, Steam and Air Conditioning Supply' },

  // ── Section E ──────────────────────────────────────────────────────────────
  { code: 'E',   label: 'Water Supply; Sewerage, Waste Management and Remediation',                           level: 'section',  sectionCode: 'E', sectionLabel: 'Water Supply; Sewerage, Waste Management and Remediation' },
  { code: 'E36', label: 'Water collection, treatment and supply',                                              level: 'division', sectionCode: 'E', sectionLabel: 'Water Supply; Sewerage, Waste Management and Remediation' },
  { code: 'E37', label: 'Sewerage',                                                                            level: 'division', sectionCode: 'E', sectionLabel: 'Water Supply; Sewerage, Waste Management and Remediation' },
  { code: 'E38', label: 'Waste collection, treatment and disposal; materials recovery',                        level: 'division', sectionCode: 'E', sectionLabel: 'Water Supply; Sewerage, Waste Management and Remediation' },
  { code: 'E39', label: 'Remediation activities and other waste management services',                          level: 'division', sectionCode: 'E', sectionLabel: 'Water Supply; Sewerage, Waste Management and Remediation' },

  // ── Section F ──────────────────────────────────────────────────────────────
  { code: 'F',   label: 'Construction',                          level: 'section',  sectionCode: 'F', sectionLabel: 'Construction' },
  { code: 'F41', label: 'Construction of buildings',             level: 'division', sectionCode: 'F', sectionLabel: 'Construction' },
  { code: 'F42', label: 'Civil engineering',                     level: 'division', sectionCode: 'F', sectionLabel: 'Construction' },
  { code: 'F43', label: 'Specialised construction activities',   level: 'division', sectionCode: 'F', sectionLabel: 'Construction' },

  // ── Section G ──────────────────────────────────────────────────────────────
  { code: 'G',   label: 'Wholesale and Retail Trade; Repair of Motor Vehicles',                          level: 'section',  sectionCode: 'G', sectionLabel: 'Wholesale and Retail Trade; Repair of Motor Vehicles' },
  { code: 'G45', label: 'Wholesale and retail trade and repair of motor vehicles and motorcycles',        level: 'division', sectionCode: 'G', sectionLabel: 'Wholesale and Retail Trade; Repair of Motor Vehicles' },
  { code: 'G46', label: 'Wholesale trade (excl. motor vehicles and motorcycles)',                         level: 'division', sectionCode: 'G', sectionLabel: 'Wholesale and Retail Trade; Repair of Motor Vehicles' },
  { code: 'G47', label: 'Retail trade (excl. motor vehicles and motorcycles)',                            level: 'division', sectionCode: 'G', sectionLabel: 'Wholesale and Retail Trade; Repair of Motor Vehicles' },

  // ── Section H ──────────────────────────────────────────────────────────────
  { code: 'H',   label: 'Transportation and Storage',                              level: 'section',  sectionCode: 'H', sectionLabel: 'Transportation and Storage' },
  { code: 'H49', label: 'Land transport and transport via pipelines',               level: 'division', sectionCode: 'H', sectionLabel: 'Transportation and Storage' },
  { code: 'H50', label: 'Water transport',                                          level: 'division', sectionCode: 'H', sectionLabel: 'Transportation and Storage' },
  { code: 'H51', label: 'Air transport',                                            level: 'division', sectionCode: 'H', sectionLabel: 'Transportation and Storage' },
  { code: 'H52', label: 'Warehousing and support activities for transportation',    level: 'division', sectionCode: 'H', sectionLabel: 'Transportation and Storage' },
  { code: 'H53', label: 'Postal and courier activities',                            level: 'division', sectionCode: 'H', sectionLabel: 'Transportation and Storage' },

  // ── Section I ──────────────────────────────────────────────────────────────
  { code: 'I',   label: 'Accommodation and Food Service Activities',  level: 'section',  sectionCode: 'I', sectionLabel: 'Accommodation and Food Service Activities' },
  { code: 'I55', label: 'Accommodation',                               level: 'division', sectionCode: 'I', sectionLabel: 'Accommodation and Food Service Activities' },
  { code: 'I56', label: 'Food and beverage service activities',        level: 'division', sectionCode: 'I', sectionLabel: 'Accommodation and Food Service Activities' },

  // ── Section J ──────────────────────────────────────────────────────────────
  { code: 'J',   label: 'Information and Communication',                                    level: 'section',  sectionCode: 'J', sectionLabel: 'Information and Communication' },
  { code: 'J58', label: 'Publishing activities',                                             level: 'division', sectionCode: 'J', sectionLabel: 'Information and Communication' },
  { code: 'J59', label: 'Motion picture, video and television programme production',         level: 'division', sectionCode: 'J', sectionLabel: 'Information and Communication' },
  { code: 'J60', label: 'Programming and broadcasting activities',                           level: 'division', sectionCode: 'J', sectionLabel: 'Information and Communication' },
  { code: 'J61', label: 'Telecommunications',                                                level: 'division', sectionCode: 'J', sectionLabel: 'Information and Communication' },
  { code: 'J62', label: 'Computer programming, consultancy and related activities',          level: 'division', sectionCode: 'J', sectionLabel: 'Information and Communication' },
  { code: 'J63', label: 'Information service activities',                                    level: 'division', sectionCode: 'J', sectionLabel: 'Information and Communication' },

  // ── Section K ──────────────────────────────────────────────────────────────
  { code: 'K',   label: 'Financial and Insurance Activities',                                                              level: 'section',  sectionCode: 'K', sectionLabel: 'Financial and Insurance Activities' },
  { code: 'K64', label: 'Financial service activities (excl. insurance and pension funding)',                              level: 'division', sectionCode: 'K', sectionLabel: 'Financial and Insurance Activities' },
  { code: 'K65', label: 'Insurance, reinsurance and pension funding (excl. compulsory social security)',                   level: 'division', sectionCode: 'K', sectionLabel: 'Financial and Insurance Activities' },
  { code: 'K66', label: 'Activities auxiliary to financial services and insurance activities',                             level: 'division', sectionCode: 'K', sectionLabel: 'Financial and Insurance Activities' },

  // ── Section L ──────────────────────────────────────────────────────────────
  { code: 'L',   label: 'Real Estate Activities',  level: 'section',  sectionCode: 'L', sectionLabel: 'Real Estate Activities' },
  { code: 'L68', label: 'Real estate activities',  level: 'division', sectionCode: 'L', sectionLabel: 'Real Estate Activities' },

  // ── Section M ──────────────────────────────────────────────────────────────
  { code: 'M',   label: 'Professional, Scientific and Technical Activities',                           level: 'section',  sectionCode: 'M', sectionLabel: 'Professional, Scientific and Technical Activities' },
  { code: 'M69', label: 'Legal and accounting activities',                                              level: 'division', sectionCode: 'M', sectionLabel: 'Professional, Scientific and Technical Activities' },
  { code: 'M70', label: 'Activities of head offices; management consultancy activities',                level: 'division', sectionCode: 'M', sectionLabel: 'Professional, Scientific and Technical Activities' },
  { code: 'M71', label: 'Architectural and engineering activities; technical testing and analysis',     level: 'division', sectionCode: 'M', sectionLabel: 'Professional, Scientific and Technical Activities' },
  { code: 'M72', label: 'Scientific research and development',                                          level: 'division', sectionCode: 'M', sectionLabel: 'Professional, Scientific and Technical Activities' },
  { code: 'M73', label: 'Advertising and market research',                                              level: 'division', sectionCode: 'M', sectionLabel: 'Professional, Scientific and Technical Activities' },
  { code: 'M74', label: 'Other professional, scientific and technical activities',                      level: 'division', sectionCode: 'M', sectionLabel: 'Professional, Scientific and Technical Activities' },
  { code: 'M75', label: 'Veterinary activities',                                                        level: 'division', sectionCode: 'M', sectionLabel: 'Professional, Scientific and Technical Activities' },

  // ── Section N ──────────────────────────────────────────────────────────────
  { code: 'N',   label: 'Administrative and Support Service Activities',                              level: 'section',  sectionCode: 'N', sectionLabel: 'Administrative and Support Service Activities' },
  { code: 'N77', label: 'Rental and leasing activities',                                               level: 'division', sectionCode: 'N', sectionLabel: 'Administrative and Support Service Activities' },
  { code: 'N78', label: 'Employment activities',                                                        level: 'division', sectionCode: 'N', sectionLabel: 'Administrative and Support Service Activities' },
  { code: 'N79', label: 'Travel agency, tour operator and other reservation service activities',        level: 'division', sectionCode: 'N', sectionLabel: 'Administrative and Support Service Activities' },
  { code: 'N80', label: 'Security and investigation activities',                                        level: 'division', sectionCode: 'N', sectionLabel: 'Administrative and Support Service Activities' },
  { code: 'N81', label: 'Services to buildings and landscape activities',                               level: 'division', sectionCode: 'N', sectionLabel: 'Administrative and Support Service Activities' },
  { code: 'N82', label: 'Office administrative, office support and other business support activities',  level: 'division', sectionCode: 'N', sectionLabel: 'Administrative and Support Service Activities' },

  // ── Section O ──────────────────────────────────────────────────────────────
  { code: 'O',   label: 'Public Administration and Defence; Compulsory Social Security',  level: 'section',  sectionCode: 'O', sectionLabel: 'Public Administration and Defence; Compulsory Social Security' },
  { code: 'O84', label: 'Public administration and defence; compulsory social security',  level: 'division', sectionCode: 'O', sectionLabel: 'Public Administration and Defence; Compulsory Social Security' },

  // ── Section P ──────────────────────────────────────────────────────────────
  { code: 'P',   label: 'Education',  level: 'section',  sectionCode: 'P', sectionLabel: 'Education' },
  { code: 'P85', label: 'Education',  level: 'division', sectionCode: 'P', sectionLabel: 'Education' },

  // ── Section Q ──────────────────────────────────────────────────────────────
  { code: 'Q',   label: 'Human Health and Social Work Activities',              level: 'section',  sectionCode: 'Q', sectionLabel: 'Human Health and Social Work Activities' },
  { code: 'Q86', label: 'Human health activities',                               level: 'division', sectionCode: 'Q', sectionLabel: 'Human Health and Social Work Activities' },
  { code: 'Q87', label: 'Residential care activities',                           level: 'division', sectionCode: 'Q', sectionLabel: 'Human Health and Social Work Activities' },
  { code: 'Q88', label: 'Social work activities without accommodation',          level: 'division', sectionCode: 'Q', sectionLabel: 'Human Health and Social Work Activities' },

  // ── Section R ──────────────────────────────────────────────────────────────
  { code: 'R',   label: 'Arts, Entertainment and Recreation',                                      level: 'section',  sectionCode: 'R', sectionLabel: 'Arts, Entertainment and Recreation' },
  { code: 'R90', label: 'Creative, arts and entertainment activities',                              level: 'division', sectionCode: 'R', sectionLabel: 'Arts, Entertainment and Recreation' },
  { code: 'R91', label: 'Libraries, archives, museums and other cultural activities',               level: 'division', sectionCode: 'R', sectionLabel: 'Arts, Entertainment and Recreation' },
  { code: 'R92', label: 'Gambling and betting activities',                                          level: 'division', sectionCode: 'R', sectionLabel: 'Arts, Entertainment and Recreation' },
  { code: 'R93', label: 'Sports activities and amusement and recreation activities',                level: 'division', sectionCode: 'R', sectionLabel: 'Arts, Entertainment and Recreation' },

  // ── Section S ──────────────────────────────────────────────────────────────
  { code: 'S',   label: 'Other Service Activities',                                    level: 'section',  sectionCode: 'S', sectionLabel: 'Other Service Activities' },
  { code: 'S94', label: 'Activities of membership organisations',                       level: 'division', sectionCode: 'S', sectionLabel: 'Other Service Activities' },
  { code: 'S95', label: 'Repair of computers and personal and household goods',         level: 'division', sectionCode: 'S', sectionLabel: 'Other Service Activities' },
  { code: 'S96', label: 'Other personal service activities',                             level: 'division', sectionCode: 'S', sectionLabel: 'Other Service Activities' },
]

/** Search NACE_DATA by code prefix or label keyword */
export function searchNace(query: string): NaceEntry[] {
  if (!query || query.length < 1) return []
  const q = query.trim().toUpperCase()
  const qLow = query.trim().toLowerCase()
  return NACE_DATA.filter(e =>
    e.code.startsWith(q) ||
    e.label.toLowerCase().includes(qLow) ||
    e.sectionLabel.toLowerCase().includes(qLow)
  ).slice(0, 12)
}

/** Look up a single entry by exact code */
export function getNaceByCode(code: string): NaceEntry | undefined {
  return NACE_DATA.find(e => e.code === code.toUpperCase())
}
