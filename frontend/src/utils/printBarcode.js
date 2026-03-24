/**
 * Печать штрихкода в формате 6×4 дюйма:
 * - слева вертикальный текст (название/код), жирный крупный
 * - справа штрихкод на всю высоту
 *
 * @param {string} barcodeValue  — значение для кодирования
 * @param {string} labelText     — текст слева (вертикально), например "С1П3"
 * @param {string} [subText]     — подпись под штрихкодом, например "Склад Ижевск"
 */
export function printBarcode(barcodeValue, labelText, subText = '') {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${labelText}</title>
  <style>
    @page { size: 6in 4in; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 6in; height: 4in;
      display: flex;
      flex-direction: row;
      align-items: stretch;
      background: #fff;
      overflow: hidden;
    }
    .left {
      width: 0.75in;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border-right: 2px solid #000;
    }
    .left span {
      transform: rotate(-90deg);
      white-space: nowrap;
      font-family: Arial Black, Arial, sans-serif;
      font-weight: 900;
      font-size: 32px;
      letter-spacing: 1px;
      color: #000;
      user-select: none;
    }
    .right {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 0.15in 0.25in;
      gap: 6px;
    }
    .right svg { width: 100%; }
    .sub {
      font-family: Arial, sans-serif;
      font-size: 15px;
      color: #333;
      text-align: center;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <div class="left"><span>${labelText}</span></div>
  <div class="right">
    <svg id="bc"></svg>
    ${subText ? `<p class="sub">${subText}</p>` : ''}
  </div>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
  <script>
    JsBarcode(document.getElementById('bc'), '${barcodeValue}', {
      format: 'CODE128',
      width: 3.5,
      height: 130,
      displayValue: true,
      fontSize: 20,
      margin: 8,
      background: '#ffffff',
      lineColor: '#000000'
    });
    window.onload = function() {
      window.print();
      window.onafterprint = function() { window.close(); };
    };
  </script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=640,height=460');
  win.document.open();
  win.document.write(html);
  win.document.close();
}
