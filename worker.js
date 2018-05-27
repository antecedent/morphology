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

var sendImages = false;

onmessage = (e) => {
    if (e.data.sendImages) {
        sendImages = e.data.sendImages;
        return;
    }
    for (var key of Object.keys(e.data.parameters)) {
        Morphology[key] = e.data.parameters[key];
    }
    try {
        var preliminaryWords = e.data.text.split(/\s+/);
        Morphology.trainingSetProportion = Morphology.trainingSetProportion1 / Morphology.trainingSetProportion2;
        var trainingSetPivot = Math.floor(preliminaryWords.length / (Morphology.trainingSetProportion + 1) * (Morphology.trainingSetProportion));
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
        var [adjacencyMatrix, morphemeMapping, relevantMorphemes, adjacencyList] =  Morphology.getAdjacencyMatrix(bigrams, morphemes, commutations, trainingSet.toLowerCase(), progress('getAdjacencyMatrix'));
        var [firstPassClusters, signatures] = task('doFirstPassClustering', () => Morphology.doFirstPassClustering(
            adjacencyMatrix,
            relevantMorphemes,
            commutations,
            morphemeMapping
        ));
        var info = Morphology.getClusterInfo(null, firstPassClusters, adjacencyList, morphemeMapping, commutations);
        var [info, firstPassClusters, adjacencyList, morphemeMapping] = Morphology.splitMorphemes(info);
        var numFirstPassClusters = new Set(firstPassClusters).size;
        Morphology.MDLUpperBound = Math.min(numFirstPassClusters, Morphology.maxNumClusters);
        task('getAdjacencyMatrix', () => [null, morphemeMapping]);
        //console.log(JSON.stringify(firstPassClusters));
        dependencies.adjacencyList = adjacencyList;
        dependencies.morphemeMapping = morphemeMapping;
        dependencies.validationPrefixTree = validationPrefixTree;
        dependencies.numValidationWords = validationWords.size;
        dependencies.trainingWords = words;

        var initialClustering = {score: 0, clusters: firstPassClusters, info: info, history: []};

        var reclusterings = [initialClustering];

        task('restoreStateFromCache', () => {
            var i = 0;
            if (e.data.parameters.clusterings) {
                try {
                    for (var clustering of e.data.parameters.clusterings) {
                        progress('restoreStateFromCache')(i++, e.data.parameters.clusterings.length);
                        try {
                            reclusterings.push(Morphology.reenactReclusteringHistory(clustering.history, firstPassClusters, info, dependencies));
                        } catch (error) {
                            reclusterings = [initialClustering];
                            debugger;
                        }
                    }
                } catch (error) {
                    debugger;
                }
            }
        });

        if (reclusterings.length > 1) {
            console.log(`${reclusterings.length - 1} clustering(s) have been loaded from local cache.`);
        }

        var highScore = 0;
        var numReclusteringsToKeep = 100;
        var numBuckets = 10;


        var firstReclustering = true;

        while (true) {
            if (reclusterings.length > numReclusteringsToKeep) {
                var reclusteringsBackup = Morphology.shuffle(reclusterings)[0];
                reclusterings = [initialClustering];
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
            var reclustering = task('doSecondPassClustering', () => Morphology.recluster(info, Array.from(clusters), reclusterings[pick].history, dependencies, firstReclustering ? progress('doSecondPassClustering') : null));
            //info = Morphology.copyClusterInfo(reclustering.info);
            reclusterings.push(reclustering);
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
            var morphemesAsObject = {};
            for (var source of Object.keys(translation)) {
                morphemesAsObject[translation[source]] = {morphemes: reclustering.info[source].morphemes};
            }
            var renumberedInfo = Array.from(Object.values(morphemesAsObject));
            task('getClusterInfo', () => renumberedInfo.map((i) => ({morphemes: i.morphemes})));
            var layout = task('generateLayout', () => Morphology.generateLayout(Object.keys(morphemeMapping).length, clustersToSend, null, renumberedInfo, e.data.canvasWidth, e.data.canvasHeight, e.data.vertexRadius, (p, t) => null));
            var edges = task('getRelevantEdges', () => Morphology.getRelevantEdges(adjacencyList, morphemeMapping, clustersToSend, renumberedInfo, (p, t) => null));
            task('getClusterings', () => reclusterings.map((r) => ({history: r.history})));
            task('network', () => Morphology.network(info));
            task('ready', () => null);
            firstReclustering = false;
        }
    } catch (error) {
        debugger;
        throw error;
        // Already handled by task()
    }
};
