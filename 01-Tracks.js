/**
 * HeatSeaker Template - Commercial Software
 * Copyright (c) 2024 Paul Stortini
 * Software Development & Maintenance by Alexander Meyer
 * 
 * ZERO LIABILITY NOTICE: Service provider assumes no liability for betting operations.
 * Client bears 100% responsibility for all business outcomes.
 * 
 * This software is provided "AS IS" without warranty.
 * For complete terms, see SERVICE_AGREEMENT.md
 * 
 * Tracks Metadata
 * Updated - 2/14/24
 */

const tracks = [
  {
    trackName: 'AQUEDUCT',
    id: '1tAaC6tVaINP1Y-pogOTy5xiLWgYs4iuXAsVj7o5Uwvc',
    trackCode: 'AQU',
    betTrackCode: 'AQD',
    scriptId: '1-ePXnbun0_t2TFMsZf3Wg2b9DAlWn7Io8UL_u4-xR9tIP27P9y_XIpeR',
    pickThreeValue: 1,
    doubleValue: 1,
    winBet: 600,
  },
  {
    trackName: 'BELMONT',
    id: '15aUadnuxdPhvG4zQtEXUq2eFh8-AmwAURLDxbLp57Ao',
    trackCode: 'BEL',
    betTrackCode: 'BED',
    scriptId: '1zZHBULAgFIRQ4WgcJz-35hqU5gBsLPqICxBJu3VEuW0Wa7S-3JgmIG7G',
    pickThreeValue: .5,
    winBet: 730,
  },
  {
    trackName: 'CHURCHILL',
    id: '1nIWXhvQohxQ-2tqfonRzuy_PMWImFCC9rn4NKDTAzrA',
    trackCode: 'CD',
    betTrackCode: 'CHD',
    scriptId: '1-etY-YVCA1ljI_SEYqBU5uyRoX0D6_S2q7lzIjOlaUG2LSodI2zA073m',
    pickThreeValue: 2,
    winBet: 730,
  },
  {
    trackName: 'DELMAR',
    id: '1jZjBNXRbV_tXwLo54jXfiEK_nD4t1TRz3XTnbp2hUow',
    trackCode: 'DMR',
    trackCode2: 'DMF',
    betTrackCode: 'DMD',
    scriptId: '1gTMq_uNC108JPxnAcaW4RkWNDDXDR4HMhkrJsDu1gkW58SvcUdymE02c',
    pickThreeValue: 2,
    winBet: 10,
  },
  {
    trackName: 'FAIR GROUNDS',
    id: '1PdsGn0BQn9Zt3iMqsRYd_7vE-ezSuYLG4yQfAiNQQcE',
    trackCode: 'FG',
    betTrackCode: 'FGD',
    scriptId: '1tKIF6eirG2xndGzQGF8U6p6GeOEkbZIJJdYO_TrLtW4qnccLRinX1xNj',
    pickThreeValue: 2,
    winBet: 730,
  },
  {
    trackName: 'GULFSTREAM',
    id: '1G2hJDgyOBhZKj1G-9lzdfM7g-tv_15bJCsxZ8tD2s6o',
    trackCode: 'GP',
    trackCode2: 'GPW',
    betTrackCode: 'GPM',
    scriptId: '1dP7VmgV6Cr4HUTSE9uRGhl6zcZx_vWasZTMgnm9b4UEb-_D9pvJMTd1K',
    pickThreeValue: 2,
    doubleValue: 1,
    winBet: 730,
  },
  {
    trackName: 'MONMOUTH',
    id: '1to1lIg53ShTGipoOd3bWNAws8oYR-P9_UAERjiXtYIQ',
    trackCode: 'MTH',
    betTrackCode: 'MTD',
    scriptId: '1b6ddJJOvHWrAePdW6oA3TX-cSd8Ibkg0FXoKvjDzRiGszToU8sAA9abm',
    pickThreeValue: 2,
    winBet: 730,
  },
  {
    trackName: 'OAKLAWN',
    id: '156NG2UVhNvAOj4x2682RPMmCGSjmYrKapOv8eP7UwYM',
    trackCode: 'OP',
    betTrackCode: 'OPM',
    scriptId: '13hSapRl_MVbvdjbcxNYbF2WT854JKiG5_u2N2gXuWa1xJ-mi6S2jFw_L',
    pickThreeValue: 2,
    doubleValue: 1,
    winBet: 10,
  },
  {
    trackName: 'PARX',
    id: '1R2ymJog_rYkf0EOw55haQt3dNvYFT0_BLsmgdzIdOKY',
    trackCode: 'PRX',
    betTrackCode: 'PHD',
    scriptId: '1ebY8C07-zIsPRoZri6Xi8BsOSU3V_SmosnZB0lGa2DPagO4b-uNZxug_',
    pickThreeValue: .5,
    winBet: 730,
  },
  {
    trackName: 'SANTA ANITA',
    id: '1SkQ2bxp5xv17ec3cIL0PYsPvY4HjZ63Jp80vCs8rnMU',
    trackCode: 'SA',
    betTrackCode: 'SAD',
    scriptId: '1Jaw1NGG8NqEIOpKQo2zAbIrLNbLwRPpI9f-rCLhu_jH_frWCcBPBCtXs',
    pickThreeValue: 2,
    doubleValue: 1,
    winBet: 730,
  },
  {
    trackName: 'SARATOGA',
    id: '160J0ZwUvrm1igb3glvN_9z269FgSbotD4hCviXFe6U4',
    trackCode: 'SAR',
    betTrackCode: 'STD',
    scriptId: '1mns3p1LmP5T0QJm-5S_ra5uGJf3sFTgWbB38dv2s2ws4oGKcpcCAFTpd',
    pickThreeValue: .5,
    winBet: 10,
  },
  {
    trackName: 'TAMPA BAY',
    id: '1n13ru7JXpGkyIyKtU6f6f7xkVhzfmV_2Er39E03FMLo',
    trackCode: 'TAM',
    betTrackCode: 'TAM',
    scriptId: '1yg6ZfhrPDKCT-EhIR_oFO9P9BCrv5qnBKCpc_9eJtk8er0mgsDkYY0qc',
    pickThreeValue: 2,
    winBet: 600,
  },
  {
    trackName: 'WOODBINE',
    id: '1uJLqD4S8UNYryMmV-h0AV9DSYMDAGRahzYApp6ghYNY',
    trackCode: 'WO',
    betTrackCode: 'WOT',
    scriptId: '12LqNIFllb8KUrcAXBlaQE-Ku_Y-Mu-CPAXduY4sSSCkfCYfx43cfOz9e',
    pickThreeValue: 5,
    winBet: 730,
  },
]
