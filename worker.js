importScripts('morphology.js');
importScripts('https://www.lactame.com/lib/ml/3.2.0/ml.min.js');

var progress = (task) => (done, total) => {
    postMessage({
        task: task,
        state: 'progress',
        progress: parseInt(100 * done / total)
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
        var trainingSetPivot = parseInt(preliminaryWords.length / (Morphology.trainingSetProportion + 1) * Morphology.trainingSetProportion);
        var trainingSet = preliminaryWords.slice(0, trainingSetPivot).join(' ');
        var validationSet = preliminaryWords.slice(trainingSetPivot).join(' ');
        var words = task('extractWords', () => Morphology.extractWords(trainingSet));
        var validationWords = Morphology.extractWords(validationSet);
        for (var word of validationWords) {
            if (words.has(word)) {
                validationWords.delete(word);
            }
        }
        task('getValidationSet', () => validationWords);
        var wordsWithBoundaries = task('addBoundaryChars', () => Morphology.addBoundaryChars(words));
        var substrings = task('getSalientSubstrings', () => Morphology.getSalientSubstrings(wordsWithBoundaries));
        var commutations = task('commute', () => Morphology.commute(substrings, wordsWithBoundaries, progress('commute')));
        var commutations = task('refineCommutations', () => Morphology.refineCommutations(commutations, words, progress('refineCommutations')));
        var bigrams = task('getBigrams', () => Morphology.getBigrams(commutations));
        var morphemes = task('getMorphemes', () => Morphology.getMorphemes(bigrams));
        var [adjacencyMatrix, morphemeMapping] = task('getAdjacencyMatrix', () => Morphology.getAdjacencyMatrix(bigrams, morphemes, trainingSet.toLowerCase()));
        var firstPassClusters = task('doFirstPassClustering', () => Morphology.doFirstPassClustering(adjacencyMatrix));
        var secondPassClusters = task('doSecondPassClustering', () => Morphology.doSecondPassClustering(adjacencyMatrix, firstPassClusters));
        var numClusters;
        [secondPassClusters, numClusters] = task('renumberClusters', () => Morphology.renumberClusters(secondPassClusters, Morphology.secondPassClusterCount));
        var morphemeTypes = task('guessClusterTypes', () => Morphology.guessClusterTypes(numClusters, secondPassClusters, adjacencyMatrix, morphemeMapping));
        var layout = task('generateLayout', () => Morphology.generateLayout(Object.keys(morphemeMapping).length, secondPassClusters, numClusters, e.data.canvasWidth, e.data.canvasHeight, e.data.vertexRadius, progress('generateLayout')));
        var edges = task('getRelevantEdges', () => Morphology.getRelevantEdges(adjacencyMatrix, morphemeMapping, progress('getRelevantEdges')));
        task('inventWords', () => Morphology.inventWords(numClusters, morphemeTypes, secondPassClusters[morphemeMapping['⋊']], secondPassClusters[morphemeMapping['⋉']], words, progress('inventWords')));
    } catch (error) {
        // Already handled by task()
    }
};
