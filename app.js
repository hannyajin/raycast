;(function() {
  var stats = new Stats();
  stats.setMode(0);
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.left = '0px';
  stats.domElement.style.top = '0px';
  document.body.appendChild( stats.domElement );

  console.log("script loaded");

  var width = 120 * 2;
  var height = (width * 9 / 16) | 0;

  var appEl = document.getElementById('app');
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');
  appEl.appendChild(canvas);

  canvas.width = width;
  canvas.height = height;
  canvas.style.width = "80%";

  ctx.fillStyle = "#444";
  ctx.fillRect(0, 0, width, height);

  var ticks = 0;

  function Map(width, height) {
    this.blockSize = 8;
    this.size = width * height;
    this.width = width;
    this.height = height;
    this.grid = [];
    // populate grid
    for (var i = 0; i < this.size; i++) {
      this.grid[i] = 0; // empty (no wall)

      // populate borders with 'walls'
      var x = i % width;
      var y = (i / width) | 0;

      if (x == 0 || y == 0 || x == (width - 1) || y == (height - 1)) {
        this.grid[i] = 1; // wall
      }
    };
  };
  Map.prototype = {
    get: function (x,y) {
      return this.grid[x + y * this.width];
    },
    randomize: function() {
      for (var i = 0; i < this.size; i++) {
        this.grid[i] = Math.random() < .1 ? 1 : this.grid[i];
      };
    }
  };

  function Keyboard() {
    this.keyStates = {};

    var self = this;
    document.body.addEventListener('keydown', function (e) {
      self.keyStates[e.keyCode] = true;
    });
    document.body.addEventListener('keyup', function (e) {
      self.keyStates[e.keyCode] = false;
    });

    this.keys = {
      LEFT: 37,
      RIGHT: 39,
      UP: 38,
      DOWN: 40
    };
  };
  var KB = new Keyboard();

  function renderMap(map) {
    var grid = map.grid;
    var size = map.size;
    var bs = map.blockSize;

    ctx.fillStyle = "#000";
    for (var i = 0; i < size; i++) {
      var cell = grid[i];

      var x = i % map.width;
      var y = (i / map.width) | 0;


      if (cell > 0) {
        ctx.fillRect(x * bs, y * bs, bs, bs)
      }
    };
  };

  function Camera(x, y, fov, dir) {
    this.x = x;
    this.y = y;
    this.fov = fov; // field of view (angle of visibility, kind of)
    this.dir = dir;

    this.lastState = { // used for camera auto wobble when AFK
      dir: this.dir,
      x: this.x,
      y: this.y
    };
    this.wobbleTimeout = null;
    this.autoWobble = true;
  };
  Camera.prototype = {
    rotate: function (rot) {
      this.dir = (this.dir + rot + 360) % 360;
      console.log(this.dir);
    },
    move: function (dist, offset) {
      var rad = (this.dir + offset) * Math.PI / 180; // conver tot radians (for Math)
      var dx = Math.cos(rad) * dist;
      var dy = Math.sin(rad) * dist;
      this.x += dx;
      this.y += dy;
    },
    keyboard: function () {
      if (KB.keyStates[KB.keys.LEFT]) {
        this.rotate(-3);
      }
      if (KB.keyStates[KB.keys.RIGHT]) {
        this.rotate(3);
      }
      if (KB.keyStates[KB.keys.UP]) {
        this.move(0.1, 0);
      }
      if (KB.keyStates[KB.keys.DOWN]) {
        this.move(0.1, 180);
      }
    },
    tick: function () {
      this.keyboard();

      if (this.x !== this.lastState.x) {
        this.autoWobble = false;
        clearTimeout(this.wobbleTimeout);
        var self = this;
        this.wobbleTimeout = setTimeout(function() {
          self.autoWobble = true;
        }, 3000);
      }

      this.lastState = { // used for camera auto wobble when AFK
        dir: this.dir,
        x: this.x,
        y: this.y
      }

      if (this.autoWobble) {
        // auto wobble the camera when idle
        var amount = Math.PI / 600;
        var delay = 66;
        this.dir += (Math.sin(ticks / delay) * amount) * 180 / Math.PI;
      };
    }
  };

  function Screen(width, height) {
    this.width = width;
    this.height = height;
  };

  var camera = new Camera(width / 16, height / 16, 60, 90);
  var screen = new Screen(width / 2, height / 2);
  var map = new Map((width / 8) | 0, (height / 8) | 0);
  map.randomize();

  window.c = camera;


  function castRays(camera, screen, map) {
    var rays = [];
    var spacing = camera.fov / screen.width;
    for (var column = 0; column < screen.width; column++) {
      var angle = column * spacing;
      var dir = (camera.dir - camera.fov / 2 + angle + 360) % 360;
      var rad = dir * Math.PI / 180; // rays angle

      var start = {
        x: camera.x + 0.5, // from middle
        y: camera.y + 0.5, // from middle
      };

      var distance2 = Infinity;
      var hitPoint = {};
      var wallOffset = 0; // offset from where the ray hit the wall

      var cos = Math.cos(rad);
      var sin = Math.sin(rad);

      // check which direction ray is going and
      // adjust for the map (left, up, right, down)
      var up = (sin > 0);
      var right = (cos > 0);

      // check vertical walls first (LEFT and RIGHT wall sides)
      var slope = sin / cos;
      var stepX = right ? 1 : -1; // 1 or -1
      var stepY = stepX * slope;

      var x = right ? Math.ceil(start.x) : Math.floor(start.x);
      var y = start.y + (x - start.x) * slope; // probably

      // check whole map for wall
      while (x >= 0 && x < map.width && y >= 0 && y < map.height) {
        var wallPos = {
          x: Math.floor(x - (right ? 0 : 1)),
          y: Math.floor(y)
        };

        // check map for collision at point
        if (map.get(wallPos.x, wallPos.y) > 0) {
          // wall found
          // calculate distance (squared, for now)
          var a = x - start.x;
          var b = y - start.y;
          var c = a * a + b * b;
          if (c < distance2) { // update if nearer
            distance2 = c;
            hitPoint = { // also save position of hit
              x: x,
              y: y
            };
            // calculate offset
            wallOffset = y - Math.floor(y); // can it be this simple? ;V
            break;
          };
        };

        // increment the step
        x += stepX;
        y += stepY;
      }; // eof while


      // check horizontal walls
      var slope = cos / sin;
      var stepY = up ? 1 : -1; // 1 or -1
      var stepX = stepY * slope;

      var y = up ? Math.ceil(start.y) : Math.floor(start.y);
      var x = start.x + (y - start.y) * slope; // probably

      // check whole map for wall
      while (x >= 0 && x < map.width && y >= 0 && y < map.height) {
        var wallPos = {
          x: Math.floor(x),
          y: Math.floor(y - (up ? 0 : 1))
        };

        // check map for collision at point
        if (map.get(wallPos.x, wallPos.y) > 0) {
          // wall found
          // calculate distance (squared, for now)
          var a = x - start.x;
          var b = y - start.y;
          var c = a * a + b * b;
          if (c < distance2) { // update if nearer
            distance2 = c;
            hitPoint = { // also save position of hit
              x: x,
              y: y
            };
            wallOffset = x - Math.floor(x); // can it be this simple? ;V
            break;
          };
        };

        // increment the step
        x += stepX;
        y += stepY;
      }; // eof while


      rays.push({
        distance2: distance2,
        hitPoint: hitPoint,
        wallOffset: wallOffset
      });
    };
    return rays;
  };


  function getHelpRays(camera, map, screen) {
    var lines = [];
    var dist = 100;
    var spacing = camera.fov / screen.width;
    for (var column = 0; column < screen.width; column++) {
      var angle = column * spacing;
      var dir = (camera.dir - camera.fov / 2 + angle + 360) % 360;
      var rad = dir * Math.PI / 180;

      // from
      var startPoint = {
        x: camera.x + 0.5, // from middle
        y: camera.y + 0.5, // from middle
      };

      // to
      var deltaPoint = {
        x: Math.cos(rad) * dist,
        y: Math.sin(rad) * dist
      };
      lines.push(deltaPoint);
    };
    return lines;
  };

  function renderHelpRays() {
    var lines = getHelpRays(camera, map, screen);
    ctx.save();
    ctx.globalAlpha = .1;
    ctx.strokeStyle = "green";
    var spacing = camera.fov / screen.width;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      ctx.beginPath();
      var xx = (camera.x + .5) * map.blockSize;
      var yy = (camera.y + .5) * map.blockSize;
      ctx.moveTo(xx, yy); // from middle of camera
      ctx.lineTo(xx + line.x, yy + line.y);
      ctx.stroke();
    };
    ctx.restore();
  };

  function renderRays() {
    var rays = castRays(camera, screen, map);
    ctx.save();
    ctx.globalAlpha = .1;
    ctx.strokeStyle = "purple";
    var spacing = camera.fov / screen.width;
    for (var i = 0; i < rays.length; i++) {
      var ray = rays[i];
      ctx.beginPath();
      var xx = (camera.x + .5) * map.blockSize;
      var yy = (camera.y + .5) * map.blockSize;
      ctx.moveTo(xx, yy); // from middle of camera
      ctx.lineTo(ray.hitPoint.x * map.blockSize, ray.hitPoint.y * map.blockSize);
      ctx.stroke();
    };
    ctx.restore();
  };


  function render() {
    ctx.clearRect(0, 0, width, height);

    var b = 8;
    renderMap(map);

    // render camera to minimap
    ctx.save();
    //ctx.globalAlpha = .4;
    ctx.fillStyle = "cyan";
    var cx = camera.x * b;
    var cy = camera.y * b;
    ctx.fillRect(cx, cy, b, b);
    // draw direction line
    ctx.strokeStyle = "blue";
    ctx.beginPath();
    var rad = camera.dir * Math.PI / 180; // rads for Math
    var len = 30;
    var dx = Math.cos(rad) * len;
    var dy = Math.sin(rad) * len;
    ctx.moveTo(cx + b / 2, cy + b / 2);
    ctx.lineTo(cx + b / 2 + dx, cy + b / 2 + dy);
    ctx.stroke();
    ctx.restore();

    renderHelpRays();
    renderRays();
  };

  var wallTexture = new Image();
  wallTexture.src = "http://fc06.deviantart.net/fs31/f/2008/227/7/8/Seamless_Brick_Wall_Texture_by_cfrevoir.jpg";
  wallTexture.src = "http://www.mocap-dancer.com/worlds/imvu/MDT/MDT-site-pictures/MDT-Long-raid-wall-06-sm.jpg";
  wallTexture.src = "wallTex.jpg";

  var drawTexture = true;

  function Renderer3D() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = screen.width;
    this.canvas.height = screen.height;
    this.canvas.style.width = "100%";
    appEl.appendChild(this.canvas);

    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, screen.width, screen.height);

    var wallHeight = 128

    this.render = function() {
      // clear screen
      this.ctx.fillStyle = "#000";
      this.ctx.fillRect(0, 0, screen.width, screen.height);
      var spacing = camera.fov / screen.width;

      var texW = wallTexture.width;
      var texH = wallTexture.height;

      var rays = castRays(camera, screen, map);
      for (var i = 0; i < rays.length; i++) {

        // for every ray draw a slice of an image/texture/rectangle
        // and scale its height based on how far away it is
        var ray = rays[i];
        var d = Math.sqrt(ray.distance2);

        // fish-eye fix
        var angle = camera.dir + i * spacing;
        var cdir = (camera.dir + camera.fov / 2 - angle + 360) % 360;
        var crad = cdir * Math.PI / 180;
        d = d * Math.cos(crad);

        var wh = wallHeight / d;

        var range = Math.sqrt(map.size) | 0;
        if (d < range) {
          var xx = i;
          var yy = ((screen.height - wh) / 2);
          var ww = 1;
          var hh = wh;

          // draw slice
          if (!drawTexture) {
            this.ctx.fillStyle = "blue";
            this.ctx.fillRect(xx, yy, ww, hh);
          } else {
            // draw slice from an image (based on where the ray hit)
            var sx = (ray.wallOffset * texW) % (texW - 1); 
            var sy = 0;
            var sw = 1; // hmm
            var sh = texH;

            this.ctx.drawImage(wallTexture, sx, sy, sw, sh, xx, yy, ww, hh);
          };

          // draw an alphaed "shadow" slice on top
          // based on how far it is
          this.ctx.save();
          var n = d / range;
          this.ctx.globalAlpha = (n);
          this.ctx.fillStyle = "#000";
          this.ctx.fillRect(xx, yy - 1, ww, hh + 2);
          this.ctx.restore();
        };
      };
    };
  };

  var Renderer = new Renderer3D();


  function tick() {
    ticks++;
    camera.tick();
  };

  var FPS = 50;
  var msPerFrame = (1000 / FPS) | 0;

  var raf = true;
  function animate() {
    stats.begin();
    render();
    Renderer.render();
    tick();
    stats.end();

    raf ? requestAnimationFrame(animate) : setTimeout(animate, msPerFrame);
  };
  raf ? requestAnimationFrame(animate) : setTimeout(animate, msPerFrame);

})();
