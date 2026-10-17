// Built-in starting points for "new creation".

export const TEMPLATES = [
  {
    id: 'dweet', name: 'Dweet', mode: 'dweet',
    code: `// dweet: u(t) runs 60 times a second, c is the canvas, x its 2d context
c.width|=0
for(i=1e3;i--;)
x.fillRect(960+900*S(i*2),540+500*C(t*PI/2+i*3),29,29)`,
  },
  {
    id: 'dweet-image', name: 'Dweet with image', mode: 'dweet',
    code: `// dweet that draws the custom image once it has loaded
c.width|=0
if(image)x.drawImage(image,960-300*C(t),540-300*S(t),600,600)`,
  },
  {
    id: 'js', name: 'JavaScript', mode: 'js',
    code: `// plain JavaScript, runs once on the page
console.log('hello from CapJS')`,
  },
  {
    id: 'html', name: 'HTML', mode: 'html',
    code: `<!-- a complete HTML page, shown as is -->
<!doctype html>
<html>
<body style="margin:0;background:#123;color:#fff;display:grid;place-items:center;height:100vh">
<h1>Hello CapJS</h1>
</body>
</html>`,
  },
  {
    id: 'three', name: 'three.js', mode: 'three',
    code: `// three.js: scene, camera and renderer are provided, t is time in seconds
if (!t)
{
scene = new THREE.Scene()
camera = new THREE.PerspectiveCamera(75,16/9)
scene.add(new THREE.AmbientLight(0x222222))
scene.add(new THREE.DirectionalLight())
geometry = new THREE.BoxGeometry(1,1,1)
material = new THREE.MeshLambertMaterial()
cube = new THREE.Mesh(geometry,material)
cube.position.set(0,0,-2)
scene.add(cube)
}
cube.rotation.set(0,t,t*2)
renderer.render(scene,camera)`,
  },
  {
    id: 'shadertoy', name: 'Shadertoy', mode: 'shadertoy',
    code: `// Shadertoy style fragment shader
void mainImage(out vec4 c, in vec2 p)
{
vec2 uv = p/iResolution.xy;
c = vec4(.5+.5*cos(iTime+uv.xyx+vec3(0,2,4)),1);
c += iMouse/iResolution.xyxy; // mouse input
//c = texture(iChannel0,uv); // custom image
}`,
  },
  {
    id: 'littlejs', name: 'LittleJS', mode: 'littlejs',
    code: `// LittleJS short: define gameInit, gameUpdate and gameRender, the app starts the engine
let ball
function gameInit()
{
ball = new EngineObject(vec2(0,0), vec2(2))
ball.color = RED
}
function gameUpdate()
{
ball.pos.x = Math.sin(time)*5
}
function gameRender()
{
drawRect(vec2(0,-6), vec2(14,1), BLUE)
}`,
  },
]
