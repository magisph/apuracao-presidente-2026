import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as receipts from '../src/collector/receipt-order.ts';

test('receipt order accepts the actual 2026 ISO date and 2022 Brazilian date',()=>{
  assert.equal(receipts.receiptSeconds('2026-10-04 18:25:49'),Date.UTC(2026,9,4,21,25,49)/1000);
  assert.equal(receipts.receiptSeconds('04/10/2026 18:25:49'),Date.UTC(2026,9,4,21,25,49)/1000);
  assert.equal(receipts.receiptSeconds('2026-10-04 08:00:00'),Date.UTC(2026,9,4,11)/1000);
  assert.throws(()=>receipts.receiptSeconds('2026-99-04 18:25:49'),/receipt/);
});
test('receipt extraction preserves first arrival for aggregated sections and validates identity',async()=>{
  const header='ANO_ELEICAO;CD_ELEICAO;NR_TURNO;CD_CARGO_PERGUNTA;SG_UF;CD_MUNICIPIO;NR_ZONA;NR_SECAO;DS_SECOES_AGREGADAS;DT_BU_RECEBIDO\n';
  const source=header+'2026;6257;1;1;AC;1066;4;77;78;2026-10-04 18:25:49\n'+
    '2026;6257;1;1;AC;1066;4;77;78;2026-10-04 18:30:00\n'+
    '2026;6257;1;6;AC;1066;4;99;;invalid other office\n';
  async function* chunks(text:string){yield text.slice(0,81);yield text.slice(81);}
  const rows=await receipts.readFirstRoundReceipts(chunks(source));
  assert.deepEqual([...rows],[['ac/01066/0004/0077',Date.UTC(2026,9,4,21,25,49)/1000],['ac/01066/0004/0078',Date.UTC(2026,9,4,21,25,49)/1000]]);
  await assert.rejects(receipts.readFirstRoundReceipts(chunks(source.replaceAll('6257','9999'))),/identity/);
});
