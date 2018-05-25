$(() => {
    window.Visualization = {
        vertexRadius: 7,
        width: 600,
        height: 600,
        maxNumClusters: 100,

        createImages: (clusters, morphemeMapping, edges, layout, callback) => {
            var numClusters = 0;
            var result = [];
            for (var c of clusters) {
                numClusters = Math.max(numClusters, c + 1);
            }
            var createImage = (i) => {
                if (i >= Math.min(numClusters, Visualization.maxNumClusters)) {
                    return;
                }
                var canvas = Visualization.createHiDPICanvas(Visualization.width, Visualization.height);
                Visualization.drawClusterRelations(i, clusters, morphemeMapping, edges, layout, canvas, Visualization.vertexRadius);
                callback(canvas.toDataURL('ímage/png'));
                window.setTimeout(() => createImage(i + 1), 10);
            };
            createImage(0);
        },

        drawClusterRelations: (cluster, clusters, morphemeMapping, edges, layout, canvas, vertexRadius) => {
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, Visualization.width, Visualization.height);
            var numClusters = 0;
            for (var c of clusters) {
                numClusters = Math.max(numClusters, c + 1);
            }
            var nodes = new Set;
            for (var [i, j] of edges) {
                if (clusters[i] == cluster || clusters[j] == cluster) {
                    nodes.add(i);
                    nodes.add(j);
                }
            }
            for (var [i, j] of edges) {
                if (!nodes.has(i) || !nodes.has(j)) {
                    continue;
                }
                if (layout[i] == null || layout[j] == null) {
                    continue;
                }
                var color;
                if (clusters[i] == cluster) {
                    color = 'rgba(0, 155, 255, 0.5)';
                } else if (clusters[j] == cluster) {
                    color = 'rgba(255, 0, 155, 0.5)';
                } else {
                    continue;
                }
                ctx.beginPath();
                var d = {x: layout[j].x - layout[i].x, y: layout[j].y - layout[i].y};
                var dl = Math.sqrt(Math.pow(d.x, 2) + Math.pow(d.y, 2));
                d.x /= dl;
                d.y /= dl;
                ctx.strokeStyle = color;
                ctx.moveTo(layout[i].x + d.x * vertexRadius, layout[i].y + d.y * vertexRadius);
                ctx.lineTo(layout[j].x - d.x * (vertexRadius + 15), layout[j].y - d.y * (vertexRadius + 15));
                ctx.stroke();
                ctx.beginPath();
                ctx.save();
                ctx.translate(layout[j].x - d.x * vertexRadius, layout[j].y - d.y * vertexRadius);
                ctx.rotate(Math.atan(d.y / d.x) + ((d.x >= 0) ? 90 : -90) * Math.PI / 180);
                ctx.moveTo(0, 0);
                ctx.lineTo(5, 15);
                ctx.lineTo(-5, 15);
                ctx.closePath();
                ctx.restore();
                ctx.fillStyle = color;
                ctx.fill();
            }
            for (var m of Object.keys(morphemeMapping)) {
                var i = morphemeMapping[m];
                if (layout[i] == null) {
                    continue;
                }
                var hue = parseInt(33 * (clusters[i] % 10));
                ctx.fillStyle = 'hsla(' + hue + ', 100%, 50%, ' + (nodes.has(i) ? 0.5 : 0.1) + ')';
                ctx.beginPath();
                ctx.arc(layout[i].x, layout[i].y, vertexRadius, 0, 2 * Math.PI);
                ctx.fill();
            }
            for (var m of Object.keys(morphemeMapping)) {
                var i = morphemeMapping[m];
                if (layout[i] == null) {
                    continue;
                }
                ctx.font = '9px \'Segoe UI\', Helvetica, Arial, sans-serif';
                ctx.fillStyle = 'rgba(0, 0, 0, ?)'.replace('?', nodes.has(i) ? 0.75 : 0.25);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(m, layout[i].x, layout[i].y);
            }
        },

        pixelRatio: (function () {
            var ctx = document.createElement("canvas").getContext("2d"),
                dpr = window.devicePixelRatio || 1,
                bsr = ctx.webkitBackingStorePixelRatio ||
                      ctx.mozBackingStorePixelRatio ||
                      ctx.msBackingStorePixelRatio ||
                      ctx.oBackingStorePixelRatio ||
                      ctx.backingStorePixelRatio || 1;

            return dpr / bsr;
        })(),

        createHiDPICanvas: (w, h, ratio) => {
            if (!ratio) { ratio = Visualization.pixelRatio; }
            var can = document.createElement("canvas");
            can.width = w * ratio;
            can.height = h * ratio;
            can.style.width = w + "px";
            can.style.height = h + "px";
            can.getContext("2d").setTransform(ratio, 0, 0, ratio, 0, 0);
            return can;
        }
    };
});
