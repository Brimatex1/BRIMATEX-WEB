<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body { margin: 0; padding: 0; background: white; }
canvas { display: block; }
</style>
</head>
<body>
<canvas id="canvas"></canvas>
<script>
const canvas = document.getElementById('canvas');
canvas.width = 800;
canvas.height = 240;
const ctx = canvas.getContext('2d');

// خلفية بيضاء
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, 800, 240);

// النص العربي
ctx.font = 'bold 96px "IBM Plex Sans Arabic", Arial';
ctx.fillStyle = '#1a2b7d';
ctx.textAlign = 'center';
ctx.textBaseline = 'top';
ctx.direction = 'rtl';
ctx.fillText('بريماتكس', 400, 20);

// النص الإنجليزي
ctx.font = 'bold 80px "Segoe UI", Arial';
ctx.fillStyle = '#1a2b7d';
ctx.textAlign = 'center';
ctx.letterSpacing = '4px';
ctx.fillText('BRIMATEX', 400, 130);

// تحميل الصورة
const link = document.createElement('a');
link.href = canvas.toDataURL('image/png');
link.download = 'brimatex-logo.png';
link.click();
</script>
</body>
</html>
