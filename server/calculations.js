/**
 * Calculations module for SRR Filling Station (Indian Oil)
 */

function formatIndianNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  const rounded = Math.round(num);
  return rounded.toLocaleString('en-IN');
}

function formatLitres(litres) {
  if (litres === null || litres === undefined || isNaN(litres)) return "0.00";
  return Number(litres).toFixed(2);
}

function calculateShiftSummary(shift, rates) {
  const petrolRate = shift.petrolRate || rates.petrol || 117.07;
  const dieselRate = shift.dieselRate || rates.diesel || 105.23;

  const stationBreakdown = {};
  let totalPetrolLitres = 0;
  let totalDieselLitres = 0;
  let totalCash = 0;
  let totalUpi = 0;
  let totalCard = 0;
  let totalExpenses = 0;

  const stationKeys = ['S1', 'S2', 'S3', 'S4'];

  stationKeys.forEach(stKey => {
    const st = shift.stations ? shift.stations[stKey] : null;
    if (!st) {
      stationBreakdown[stKey] = {
        stationId: stKey,
        employeeName: "-",
        petrolLitres: 0,
        dieselLitres: 0,
        petrolAmount: 0,
        dieselAmount: 0,
        totalAmount: 0,
        collections: { cash: 0, upi: 0, card: 0, expenses: 0 },
        shortageOrExcess: 0
      };
      return;
    }

    const pOpen = Number(st.meters?.petrol?.open || 0);
    const pClose = Number(st.meters?.petrol?.close || 0);
    const pTesting = Number(st.meters?.petrol?.testing || 0);
    const pSale = pClose > pOpen ? Number((pClose - pOpen - pTesting).toFixed(2)) : (st.meters?.petrol?.saleLitres || 0);

    const dOpen = Number(st.meters?.diesel?.open || 0);
    const dClose = Number(st.meters?.diesel?.close || 0);
    const dTesting = Number(st.meters?.diesel?.testing || 0);
    const dSale = dClose > dOpen ? Number((dClose - dOpen - dTesting).toFixed(2)) : (st.meters?.diesel?.saleLitres || 0);

    const pAmt = Math.round(pSale * petrolRate);
    const dAmt = Math.round(dSale * dieselRate);
    const stExpectedAmt = pAmt + dAmt;

    const cash = Number(st.collections?.cash || 0);
    const upi = Number(st.collections?.upi || 0);
    const card = Number(st.collections?.card || 0);
    const expenses = Number(st.collections?.expenses || 0);

    totalPetrolLitres += pSale;
    totalDieselLitres += dSale;
    totalCash += cash;
    totalUpi += upi;
    totalCard += card;
    totalExpenses += expenses;

    stationBreakdown[stKey] = {
      stationId: stKey,
      pump: st.pump || (stKey === 'S1' || stKey === 'S2' ? 'Pump 1' : 'Pump 2'),
      employeeName: st.employeeName || "Unassigned",
      meters: {
        petrol: {
          code: st.meters?.petrol?.code || (stKey === 'S1' || stKey === 'S3' ? 'A1' : 'B1'),
          open: pOpen,
          close: pClose,
          testing: pTesting,
          saleLitres: pSale
        },
        diesel: {
          code: st.meters?.diesel?.code || (stKey === 'S1' || stKey === 'S3' ? 'A2' : 'B2'),
          open: dOpen,
          close: dClose,
          testing: dTesting,
          saleLitres: dSale
        }
      },
      petrolLitres: pSale,
      dieselLitres: dSale,
      petrolAmount: pAmt,
      dieselAmount: dAmt,
      expectedAmount: stExpectedAmt,
      collections: {
        cash,
        upi,
        card,
        expenses,
        expenseReason: st.collections?.expenseReason || "",
        notes: st.collections?.notes || ""
      },
      status: st.status || 'pending'
    };
  });

  totalPetrolLitres = Number(totalPetrolLitres.toFixed(2));
  totalDieselLitres = Number(totalDieselLitres.toFixed(2));

  const totalPetrolAmount = Math.round(totalPetrolLitres * petrolRate);
  const totalDieselAmount = Math.round(totalDieselLitres * dieselRate);
  const grandTotalAmount = totalPetrolAmount + totalDieselAmount;

  // Format date display DD-MM-YYYY
  let dateFormatted = shift.date || "23-10-2026";
  if (dateFormatted.includes('-') && dateFormatted.split('-')[0].length === 4) {
    const parts = dateFormatted.split('-');
    dateFormatted = `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  // Exact slip text formatting required by user in Telugu & English
  const slipText = 
`SRR FILLING STATION ${dateFormatted}
      పెట్రోల్ 
=${totalPetrolLitres} litres
=${totalPetrolLitres}*${petrolRate}
=${formatIndianNumber(totalPetrolAmount)} amount 
          డీజిల్ 
=${totalDieselLitres} litres
=${totalDieselLitres}*${dieselRate}
=${formatIndianNumber(totalDieselAmount)} amount 
P+D=${totalPetrolAmount}+${totalDieselAmount}
        =${formatIndianNumber(grandTotalAmount)} amount`;

  return {
    date: shift.date,
    dateFormatted,
    petrolRate,
    dieselRate,
    petrol: {
      litres: totalPetrolLitres,
      rate: petrolRate,
      amount: totalPetrolAmount,
      formattedLitres: formatLitres(totalPetrolLitres),
      formattedAmount: formatIndianNumber(totalPetrolAmount)
    },
    diesel: {
      litres: totalDieselLitres,
      rate: dieselRate,
      amount: totalDieselAmount,
      formattedLitres: formatLitres(totalDieselLitres),
      formattedAmount: formatIndianNumber(totalDieselAmount)
    },
    grandTotal: {
      amount: grandTotalAmount,
      formattedAmount: formatIndianNumber(grandTotalAmount)
    },
    reconciliation: {
      totalExpected: grandTotalAmount,
      totalCash,
      totalUpi,
      totalCard,
      totalExpenses,
      netCollected: totalCash + totalUpi + totalCard - totalExpenses
    },
    stations: stationBreakdown,
    slipText
  };
}

module.exports = {
  formatIndianNumber,
  formatLitres,
  calculateShiftSummary
};
