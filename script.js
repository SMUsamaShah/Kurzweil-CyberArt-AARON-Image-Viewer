//const codes = window["aaron-image"].value;

function renderImage(imgFileText) {
  const ctx = document.getElementById('canvas').getContext('2d');
  /**
   * nb = brush size
   * nc = color number (148 colors total defined in the beginning)
   * efghijkl = stroke directions, 1px
   * - e = right
   * - f = right up
   * - g = up
   * - h = up left
   * - i = left
   * - j = left down
   * - k = down
   * - l = down right
   * am = new start point
   * ad = end point
   * */

  let lines = imgFileText.split(/\r\n|\n/);
  // read coords
  let first_line = lines[0].split(' ');
  const res_x = parseInt(first_line[0]);
  const res_y = parseInt(first_line[1]);
  const num_colors = parseInt(first_line[2]);
  console.log(num_colors);

  ctx.canvas.width = res_x;
  ctx.canvas.height = res_y;
  ctx.lineCap = 'round';

  ctx.fillStyle = '#C8C8C8';
  ctx.fillRect(0, 0, res_x, res_y);

  const colors = [];
  //color values
  for (let i = 1; i <= num_colors; i++) {
    let rgb = lines[i].split(' ');
    let color = `rgb(${parseFloat(rgb[0]) * 100}%, ${parseFloat(rgb[1]) *
      100}%, ${parseFloat(rgb[2]) * 100}%)`;
    colors.push(color);
  }

  let px = 0;
  let py = 0;
  let x = 0;
  let y = 0;

  // ctx.scale(1,0.5);
  let brush_size = 1;
  let brush_color = `rgb(0%, 0%, 0%)`;
  let colors_filled = false;
  let last_stroke_index = 0;

  const n = lines.length;
  for (let i = 0; i < n; i++) {
    // if (i > 27400) break;
    let args = lines[i].split(' ');
    let cmd = args[0];

    switch (cmd) {
      case 'nc':
        brush_color = colors[args[1]];
        ctx.strokeStyle = brush_color;
        break;
      case 'nb':
        brush_size = parseInt(args[1]);
        ctx.lineWidth = brush_size;
        break;
      case 'e':
        moveBrush(++x, y);
        break;
      case 'f':
        moveBrush(++x, ++y);
        break;
      case 'g':
        moveBrush(x, ++y);
        break;
      case 'h':
        moveBrush(--x, ++y);
        break;
      case 'i':
        moveBrush(--x, y);
        break;
      case 'j':
        moveBrush(--x, --y);
        break;
      case 'k':
        moveBrush(x, --y);
        break;
      case 'l':
        moveBrush(++x, --y);
        break;
      case 'am':
        // ctx.stroke();
        // ctx.closePath();
        //--------------
        x = parseFloat(args[1]);
        y = parseFloat(args[2]);
        //lineFrom(x, y);
        // ctx.beginPath();
        // ctx.moveTo(x, y);
        px = x;
        py = y;
        break;
      case 'ad':
        x = parseFloat(args[1]);
        y = parseFloat(args[2]);
        // ctx.beginPath();
        // ctx.lineTo(x, y);
        // ctx.stroke();
        // ctx.closePath();
        line(x, y);
        break;
      case 'color':
        if (colors_filled === true) {
          i = n;
        }
        last_stroke_index = i - 1;
        break;
      case 'end':
        colors_filled = true;
        i = num_colors;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.5;

        ctx.stroke();
        ctx.closePath();
    }
  }

  function moveBrush(x, y) {
    // ctx.beginPath();
    // ctx.lineTo(x, y);
    // ctx.stroke();
    // ctx.closePath();
    line(x, y);
  }

  function line(x, y) {
    //console.log(px, x);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.closePath();
    px = x;
    py = y;
  }
}
