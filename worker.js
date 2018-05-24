importScripts('morphology.js');
importScripts('https://www.lactame.com/lib/ml/3.2.0/ml.min.js');

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
        var [adjacencyMatrix, morphemeMapping, relevantMorphemes] = task('getAdjacencyMatrix', () => Morphology.getAdjacencyMatrix(bigrams, morphemes, commutations, trainingSet.toLowerCase(), progress('getAdjacencyMatrix')));
        var [_firstPassClusters, signatures] = task('doFirstPassClustering', () => Morphology.doFirstPassClustering(
            adjacencyMatrix,
            relevantMorphemes,
            commutations,
            morphemeMapping
        ));
        var [score, secondPassClusters, numClusters, clusterInfo, inventedWords] = task('doSecondPassClustering.1', () => Morphology.doSecondPassClustering(
            adjacencyMatrix,
            _firstPassClusters,
            words,
            validationWords,
            morphemeMapping,
            commutations,
            signatures,
            validationPrefixTree,
            progress('doSecondPassClustering.1', 1)
        ));
        var numFirstPassClusters = (new Set(_firstPassClusters)).size;
        task('score', () => score);
        var translation = {};
        [secondPassClusters, numClusters] = task('renumberClusters', () => Morphology.renumberClusters(secondPassClusters, numClusters, morphemeMapping, translation));
        clusterInfo = task('getClusterInfo', () => {
            var redundant = Morphology.copyClusterInfo(clusterInfo);
            var result = [];
            var visited = new Set;
            result.fill(null, 0, numClusters);
            for (var cluster of redundant) {
                if (visited.has(cluster.id)) {
                    continue;
                }
                visited.add(cluster.id);
                result[translation[cluster.id]] = cluster;
                cluster.id = translation[cluster.id];
            }
            return result;
        });
        inventedWords.sort();
        task('inventWords', () => inventedWords);
        var layout = task('generateLayout', () => Morphology.generateLayout(Object.keys(morphemeMapping).length, secondPassClusters, numClusters, clusterInfo, e.data.canvasWidth, e.data.canvasHeight, e.data.vertexRadius, progress('generateLayout')));
        var edges = task('getRelevantEdges', () => Morphology.getRelevantEdges(adjacencyMatrix, morphemeMapping, secondPassClusters, clusterInfo, progress('getRelevantEdges')));
        task('ready', () => null)
        task('segment', () => Morphology.segment(e.data.text, wordsWithBoundaries, secondPassClusters, clusterInfo, morphemeMapping, progress('segment')));
        task('done', () => null)
    } catch (error) {
        // Already handled by task()
    }
};
