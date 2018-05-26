importScripts('morphology.js');
importScripts('https://www.lactame.com/lib/ml/3.2.0/ml.min.js');

var dependencies = {};

var progress = (task, precision) => (done, total) => {
    if (!precision) {
        precision = 0;
    }
    postMessage({
        task: task,
        state: 'progress',
        progress: (100 * done / total).toFixed(precision)
    });
};

var task = (name, callback) => {
    postMessage({
        task: name,
        state: 'initiated'
    });
    try {
        var result = callback();
        postMessage({
            task: name,
            state: 'completed',
            result: result
        });
        dependencies[name] = result;
        return result;
    } catch (error) {
        postMessage({
            task: name,
            state: 'failed',
            stack: error.stack
        });
        throw error;
    }
};

onmessage = (e) => {
    for (var key of Object.keys(e.data.parameters)) {
        Morphology[key] = e.data.parameters[key];
    }
    try {
        var preliminaryWords = e.data.text.split(/\s+/);
        var trainingSetPivot = Math.floor(preliminaryWords.length / (Morphology.trainingSetProportion + 1) * (Morphology.trainingSetProportion));
        trainingSetPivot = Math.min(trainingSetPivot, 30000);
        var trainingSet = preliminaryWords.slice(0, trainingSetPivot).join(' ');
        var validationSet = preliminaryWords.slice(trainingSetPivot).join(' ');
        var words = task('extractWords', () => Morphology.extractWords(trainingSet));
        var validationWords = Morphology.extractWords(validationSet);
        for (var word of Array.from(validationWords)) {
            if (words.has(word)) {
                validationWords.delete(word);
            }
        }
        task('getValidationSet', () => validationWords);
        var wordsWithBoundaries = task('addBoundaryChars', () => Morphology.addBoundaryChars(words));
        var [prefixTree, wordArray] = task('makePrefixTree', () => Morphology.makePrefixTree(wordsWithBoundaries, progress('makePrefixTree')));
        var [validationPrefixTree, _] = task('makeValidationPrefixTree', () => Morphology.makePrefixTree(Array.from(validationWords).map((w) => '⋊' + w + '⋉'), progress('makeValidationPrefixTree'), true));
        var substrings = task('getSalientSubstrings', () => Morphology.getSalientSubstrings(wordsWithBoundaries));
        preliminaryWords = [];
        var commutations = task('commute', () => Morphology.commute(substrings, wordsWithBoundaries, prefixTree, wordArray, progress('commute')));
        commutations = task('refineCommutations', () => Morphology.refineCommutations(commutations, prefixTree, wordArray, progress('refineCommutations')));
        var bigrams = task('getBigrams', () => Morphology.getBigrams(commutations));
        var morphemes = task('getMorphemes', () => Morphology.getMorphemes(bigrams));
        var [adjacencyMatrix, morphemeMapping, relevantMorphemes] =  Morphology.getAdjacencyMatrix(bigrams, morphemes, commutations, trainingSet.toLowerCase(), progress('getAdjacencyMatrix'));
        var [firstPassClusters, signatures] = task('doFirstPassClustering', () => Morphology.doFirstPassClustering(
            adjacencyMatrix,
            relevantMorphemes,
            commutations,
            morphemeMapping
        ));
        var info = Morphology.getClusterInfo(null, firstPassClusters, adjacencyMatrix, morphemeMapping, commutations);
        var [info, firstPassClusters, adjacencyMatrix, morphemeMapping] = Morphology.splitMorphemes(info);
        var numFirstPassClusters = new Set(firstPassClusters).size;
        Morphology.MDLUpperBound = numFirstPassClusters;
        task('getAdjacencyMatrix', () => [null, morphemeMapping]);
        //console.log(JSON.stringify(firstPassClusters));
        dependencies.adjacencyMatrix = adjacencyMatrix;
        dependencies.morphemeMapping = morphemeMapping;
        dependencies.validationPrefixTree = validationPrefixTree;
        dependencies.numValidationWords = validationWords.size;
        dependencies.trainingWords = words;

        var reclusterings = /*e.data.parameters.clusterings ||*/ [{score: 0, clusters: firstPassClusters, info: info}];

        if (reclusterings.length > 0) {
            //console.log(`${reclusterings.length} clustering(s) have been loaded from local cache.`);
        }

        var highScore = 0;
        var numReclusteringsToKeep = 100;
        var numBuckets = 10;


        var firstReclustering = true;

        var layout = task('generateLayout', () => Morphology.generateLayout(Object.keys(morphemeMapping).length, firstPassClusters, null, info, e.data.canvasWidth, e.data.canvasHeight, e.data.vertexRadius, progress('generateLayout')));
        var edges = task('getRelevantEdges', () => Morphology.getRelevantEdges(adjacencyMatrix, morphemeMapping, firstPassClusters, info, progress('getRelevantEdges')));

        while (true) {
            if (reclusterings.length > numReclusteringsToKeep) {
                var reclusteringsBackup = Morphology.shuffle(reclusterings)[0];
                reclusterings = [];
                var max = reclusteringsBackup.reduce((a, x) => Math.max(x.score, a), 0);
                var min = reclusteringsBackup.reduce((a, x) => Math.min(x.score, a), Infinity);
                var bucketSize = (max - min) / numBuckets;
                for (var bucket = min; bucket < max; bucket += bucketSize) {
                    var i = 0;
                    for (var r of reclusteringsBackup) {
                        if (r.score >= bucket && r.score <= bucket + bucketSize) {
                            reclusterings.push(r);
                            if (i++ > numReclusteringsToKeep / numBuckets) {
                                break;
                            }
                        }
                    }
                }

            }
            reclusterings.sort((l, r) => r.score - l.score);
            //console.log(JSON.stringify(reclusterings.map((x) => x.score)));
            var span = reclusterings.length;
            if (Math.random() < 0.5) {
                span = Math.sqrt(span);
            }
            var pick = Math.floor(span * Math.random());
            var clusters = Array.from(reclusterings[pick].clusters);
            info = Morphology.copyClusterInfo(reclusterings[pick].info);
            var reclustering = task('doSecondPassClustering', () => Morphology.recluster(info, Array.from(clusters), dependencies, firstReclustering ? progress('doSecondPassClustering') : null));
            //info = Morphology.copyClusterInfo(reclustering.info);
            reclusterings.push({clusters: Array.from(reclustering.clusters), score: reclustering.score, info: reclustering.info});
            console.log((100 * reclustering.score).toFixed(2) + '%');
            if (reclustering.score - highScore < Morphology.minGain) {
                continue;
            }
            highScore = reclustering.score;
            task('beginPayload', () => true);
            task('score', () => reclustering.score);
            task('inventWords', () => reclustering.inventedWords);
            var translation = {};
            var [clustersToSend, numClustersToSend] = task('renumberClusters', () => Morphology.renumberClusters(reclustering.clusters, null, morphemeMapping, translation));
            task('doSecondPassClustering', () => clustersToSend);
            task('getClusterInfo', () => {
                var morphemesAsObject = {};
                for (var source of Object.keys(translation)) {
                    morphemesAsObject[translation[source]] = {morphemes: reclustering.info[source].morphemes};
                }
                return Array.from(Object.values(morphemesAsObject));
            });
            task('ready', () => null);
            //task('getClusterings', () => reclusterings);
            firstReclustering = false;
        }
    } catch (error) {
        throw error;
        // Already handled by task()
    }
};
