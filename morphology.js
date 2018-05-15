Morphology = {
    leadingPunctuation: /^[!"#$%&\'()*+,-./:;<=>?@\[\\\]\^_`{|}~—‘’“”¿¡«»-]*/,
    trailingPunctuation: /[!"#$%&\'()*+,-./:;<=>?@\[\\\]\^_`{|}~—‘’“”¿¡«»-]*$/,
    preferredMorphemeLength: 3,
    numSalientSubstrings: 1000,
    minCommutationStrength: 10,
    minEdgeStrength: 1,
    firstPassSquashingFactor: 50,
    firstPassClusterCount: 100,
    secondPassSquashingFactor: 150,
    secondPassClusterCount: 50,
    edgeThresholdFactor: 5,
    pruningThreshold: 1000,
    openClassThresholdFactor: 100,
    successorThresholdFactor: 5,
    numWordsToInvent: 100,

    extractWords: (text) => {
        var words = new Set;
        for (var word of text.toLowerCase().split(/\s+/)) {
            word = word.replace(Morphology.leadingPunctuation, '');
            word = word.replace(Morphology.trailingPunctuation, '');
            words.add(word);
        }
        return words;
    },
    addBoundaryChars: (words) => {
        var result = new Set;
        for (var word of words) {
            result.add('⋊' + word + '⋉');
        }
        return result;
    },
    getSubstrings: (word) => {
        var result = new Set;
        result.add('')
        for (var i = 0; i < word.length + 1; i++) {
            for (var j = i + 1; j < word.length + 1; j++) {
                result.add(word.slice(i, j));
            }
        }
        return result;
    },
    getAllSubstrings: (words) => {
        var result = [];
        for (var word of words) {
            for (substring of Morphology.getSubstrings(word)) {
                result.push(substring);
            }
        }
        return result;
    },
    getFrequencyTable: (tokens) => {
        var table = {};
        for (var token of tokens) {
            if (!table.hasOwnProperty(token)) {
                table[token] = 0;
            }
            table[token]++;
        }
        return table;
    },
    getSalienceTable: (tokens) => {
        var result = [];
        var frequencies = Morphology.getFrequencyTable(tokens);
        for (var token of Object.keys(frequencies)) {
            result.push([frequencies[token] * Math.exp(-0.5 * Math.pow(token.length - Morphology.preferredMorphemeLength, 2)), token]);
        }
        result.sort((l, r) => r[0] - l[0]);
        return result;
    },
    getSalientSubstrings: (words) => {
        var substrings = Morphology.getAllSubstrings(words);
        var table = Morphology.getSalienceTable(substrings);
        var result = [];
        for (var [_, s] of table.slice(0, Morphology.numSalientSubstrings)) {
            result.push(s);
        }
        return result;
    },
    commute: (substrings, wordsWithBoundaries, progressCallback) => {
        var templates = {};
        var progress = 0;
        for (var m of substrings) {
            progressCallback(progress++, substrings.length);
            for (var word of wordsWithBoundaries) {
                if (word.includes(m)) {
                    t = word.replace(m, '_');
                    if (!templates.hasOwnProperty(t)) {
                        templates[t] = new Set;
                    }
                    templates[t].add(m);
                }
            }
        }
        var commutations = {};
        for (var t of Object.keys(templates)) {
            for (var m1 of templates[t]) {
                for (var m2 of templates[t]) {
                    if (m1 == m2) {
                        continue;
                    }
                    var key = m1 + ':' + m2;
                    if (!commutations.hasOwnProperty(key)) {
                        commutations[key] = new Set;
                    }
                    commutations[key].add(t);
                }
            }
        }
        var result = [];
        for (var key of Object.keys(commutations)) {
            [m1, m2] = key.split(':');
            if (commutations[key].size > Morphology.minCommutationStrength) {
                result.push([commutations[key], m1, m2]);
            }
        }
        return result;
    },
    refineCommutations: (commutations, words /* WITHOUT boundaries */, progressCallback) => {
        var nodes = new Set;
        var scores = {};
        var edges = new Set;
        for (var [set, m1, m2] of commutations) {
            if (m2 < m1) {
                [m1, m2] = [m2, m1];
            }
            var minor = m1 + ':' + m2;
            nodes.add(minor);
            if (!scores.hasOwnProperty(minor)) {
                edges[minor] = 0;
            }
            edges[minor] += set.size;
            for (var sub1 of Morphology.getSubstrings(m1)) {
                for (var sub2 of Morphology.getSubstrings(m2)) {
                    major = sub1 + ':' + sub2;
                    if (minor != major && m1.replace(sub1, '') == m2.replace(sub2, '')) {
                        nodes.add(major);
                        if (!scores.hasOwnProperty(major)) {
                            edges[major] = 0;
                        }
                        scores[major] += set.size;
                        edges.add([major, minor]);
                    }
                }
            }
        }
        for (var c1 of new Set(nodes)) {
            for (var c2 of new Set(nodes)) {
                var [m1, m2, m3, m4] = c1.split(':') + c2.split(':');
                if (c1 != c2 && scores[c1] >= scores[c2] && m3.replace(m1, '') == m4.replace(m2, '')) {
                    nodes.delete(c2);
                }
            }
        }
        var preResult = {};
        var progress = 0;
        for (var c of nodes) {
            progressCallback(progress++, nodes.size);
            var [m1, m2] = c.split(':');
            var hits = {};
            for (var word of words) {
                for (var m of [m1, m2]) {
                    var key = word.replace(m, '');
                    if (!hits.hasOwnProperty(key)) {
                        hits[key] = [];
                    }
                    hits[key].push(m == '' ? word : word.replace(m, '_'));
                }
            }
            preResult[m1 + ':' + m2] = new Set;
            for (var t of Object.keys(hits)) {
                if (hits[t].length > 1) {
                    for (var hit of hits[t]) {
                        if (hit.includes('_')) {
                            preResult[m1 + ':' + m2].add(hit);
                            break;
                        }
                    }
                }
            }
        }
        for (var c of Object.keys(preResult)) {
            var [m1, m2] = c.split(':');
            for (var t of new Set(preResult[c])) {
                if ((t.match(/_/g) || []).length > 1 || !words.has(t.replace('_', m1)) || !words.has(t.replace('_', m2))) {
                    preResult[c].delete(t);
                }
            }
        }
        var result = [];
        for (var c of Object.keys(preResult)) {
            var [m1, m2] = c.split(':');
            if (preResult[c].size > Morphology.minCommutationStrength)
                result.push([preResult[c], m1, m2]);
        }
        return result;
    },

    getBigrams: (commutations) => {
        var preResult = {};
        for (var [set, m1, m2] of commutations) {
            for (var t of set) {
                var [left, right] = t.split('_');
                var additions = [];
                if (m1 == '') {
                    additions = [
                        ['⋊', left], [left, right], [right, '⋉'],
                        ['⋊', left], [left, m2], [m2, right], [right, '⋉']
                    ];
                } else {
                    additions = [
                        ['⋊', left], [left, m1], [m1, right], [right, '⋉'],
                        ['⋊', left], [left, m2], [m2, right], [right, '⋉']
                    ];
                }
                if (left == '') {
                    additions.push(['⋊', m1]);
                    additions.push(['⋊', m2]);
                }
                if (right == '') {
                    additions.push([m1, '⋉']);
                    additions.push([m2, '⋉']);
                    if (m1 == '') {
                        additions.push([left, '⋉']);
                    }
                }
                var additionSet = new Set;
                for (var [a, b] of additions) {
                    if (a == '' || b == '') {
                        continue;
                    }
                    var key = a + ':' + b;
                    if (!preResult.hasOwnProperty(key)) {
                        preResult[key] = new Set;
                    }
                    for (var w of [t.replace('_', m1), t.replace('_', m2)]) {
                        if (('⋊' + w + '⋉').includes(a + b)) {
                            preResult[key].add(w);
                        }
                    }
                }
            }
        }
        var result = [];
        for (var ab of Object.keys(preResult)) {
            var [a, b] = ab.split(':');
            result.push([preResult[ab].size, a, b]);
        }
        return result;
    },

    getMorphemes: (bigrams) => {
        var result = new Set;
        for (var [score, m1, m2] of bigrams) {
            result.add(m1);
            result.add(m2);
        }
        return result;
    },

    getAdjacencyMatrix: (bigrams, morphemes, text) => {
        var preResult = {};
        for (var [score, m1, m2] of bigrams) {
            var key = (m1 < m2) ? (m1 + ':' + m2) : (m2 + ':' + m1);
            if (!preResult.hasOwnProperty(key)) {
                preResult[key] = 0;
            }
            if (m1 < m2) {
                preResult[key] += score;
            } else {
                preResult[key] -= score;
            }
        }
        var relevantMorphemes = Array.from(morphemes);
        var frequencies = {};
        for (var morpheme of relevantMorphemes) {
            frequencies[morpheme] = (text.match(new RegExp(morpheme, 'g')) || []).length;
        }
        relevantMorphemes.sort((l, r) => frequencies[r] - frequencies[l]);
        relevantMorphemes = ['⋊', '⋉'].concat(relevantMorphemes.slice(0, Morphology.pruningThreshold));
        var morphemeMapping = {};
        var k = 0;
        for (var morpheme of relevantMorphemes) {
            morphemeMapping[morpheme] = k++;
        }
        var result = [];
        for (var i = 0; i < k; i++) {
            result.push([]);
            for (var j = 0; j < k; j++) {
                result[i].push(0);
            }
        }
        relevantMorphemes = new Set(relevantMorphemes);
        for (var key of Object.keys(preResult)) {
            var [m1, m2] = key.split(':');
            if (!relevantMorphemes.has(m1) || !relevantMorphemes.has(m2)) {
                continue;
            }
            if (preResult[key] > 0) {
                result[morphemeMapping[m1]][morphemeMapping[m2]] = Math.tanh(preResult[key] / Morphology.firstPassSquashingFactor);
            } else {
                result[morphemeMapping[m2]][morphemeMapping[m1]] = Math.tanh(-preResult[key] / Morphology.firstPassSquashingFactor);
            }
        }
        return [result, morphemeMapping];
    },

    concatenateMatrices: (mat1, mat2) => {
        var result = [];
        for (var i = 0; i < Math.min(mat1.length, mat2.length); i++) {
            result.push([]);
            for (var j = 0; j < mat1[i].length; j++) {
                result[i].push(mat1[i][j]);
            }
            for (var j = 0; j < mat2[i].length; j++) {
                result[i].push(mat2[i][j]);
            }
        }
        return result;
    },

    transposeMatrix: (mat) => {
        var result = [];
        for (var i = 0; i < mat[0].length; i++) {
            result.push([]);
            for (var j = 0; j < mat.length; j++) {
                result[i].push(mat[j][i]);
            }
        }
        return result;
    },

    doFirstPassClustering: (adjacencyMatrix) => {
        var features = Morphology.concatenateMatrices(adjacencyMatrix, Morphology.transposeMatrix(adjacencyMatrix));
        return ML.KMeans(features, Morphology.firstPassClusterCount, {initialization: 'random'}).clusters;
    },

    doSecondPassClustering: (adjacencyMatrix, firstPassClusters) => {
        var features = [];
        for (var i = 0; i < adjacencyMatrix.length; i++) {
            features.push([]);
            for (var j = 0; j < 2 * Morphology.firstPassClusterCount; j++) {
                features[i].push(0);
            }
        }
        for (var i = 0; i < adjacencyMatrix.length; i++) {
            for (var j = 0; j < adjacencyMatrix.length; j++) {
                features[i][firstPassClusters[j]] += adjacencyMatrix[i][j];
                features[j][Morphology.firstPassClusterCount + firstPassClusters[i]] += adjacencyMatrix[i][j];
            }
        }
        for (var i = 0; i < adjacencyMatrix.length; i++) {
            for (var j = 0; j < 2 * Morphology.firstPassClusterCount; j++) {
                features[i][j] = Math.tanh(features[i][j] / Morphology.secondPassSquashingFactor);
            }
        }
        return ML.KMeans(features, Morphology.secondPassClusterCount, {initialization: 'random'}).clusters;
    },

    generateLayout: (numMorphemes, clusters, numClusters, width, height, radius, progressCallback) => {
        var result = [];
        var numFailures = 0;
        var epsilon = radius;
        for (var i = 0; i < numMorphemes; i++) {
            progressCallback(i, numMorphemes);
            var candidate = {
                x: parseInt((width / 2) + (width / 2) * 0.8 * (Math.cos(2 * Math.PI / numClusters * clusters[i])) + epsilon * (2 * Math.random() - 1)),
                y: parseInt((height / 2) + (height / 2) * 0.8 * (Math.sin(2 * Math.PI / numClusters * clusters[i])) + epsilon * (2 * Math.random() - 1))
            };
            var [x1, y1] = [candidate.x, candidate.y];
            failed = false;
            for (var other of result) {
                if (candidate == other || other == null) {
                    continue;
                }
                [x2, y2] = [other.x, other.y];
                if (Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2)) < 1.25 * radius || x1 < radius || y1 < radius || x1 + radius > width || y1 + radius > height) {
                    failed = true;
                    break;
                }
            }
            if (failed && numFailures < 20) {
                i--;
                numFailures++;
                epsilon += radius * 0.25;
            } else {
                if (!failed) {
                    result.push(candidate);
                } else {
                    result.push(null);
                }
                numFailures = 0;
                epsilon = radius;
            }
        }
        return result;
    },

    renumberClusters: (clusters, numClusters) => {
        var translation = {};
        var result = [];
        var last = 0;
        for (var i = 0; i < numClusters; i++) {
            if (!translation.hasOwnProperty(i) && clusters.includes(i)) {
                translation[i] = last++;
            }
        }
        for (var cluster of clusters) {
            result.push(translation[cluster]);
        }
        return [result, last];
    },

    getRelevantEdges: (adjacencyMatrix, morphemeMapping, progressCallback) => {
        var edges = [];
        var count = Object.keys(morphemeMapping).length;
        for (var i = 0; i < count; i++) {
            progressCallback(i, count);
            for (var j = 0; j < count; j++) {
                if (adjacencyMatrix[i][j] > 0) {
                    edges.push([i, j]);
                }
            }
        }
        return edges;
    },

    guessClusterTypes: (numClusters, clusters, adjacencyMatrix, morphemeMapping) => {

        //
        // TODO
        //

        var reverseMorphemeMapping = [];
        for (var morpheme of Object.keys(morphemeMapping)) {
            reverseMorphemeMapping[morphemeMapping[morpheme]] = morpheme;
        }
        var counts = [];
        for (var i = 0; i < numClusters; i++) {
            counts.push(0);
            for (var cluster of clusters) {
                if (cluster == i) {
                    counts[i]++;
                }
            }
        }
        var sortedCounts = Array.from(counts);
        var prefixSums = [sortedCounts[0]];
        for (var i = 1; i < numClusters; i++) {
            prefixSums[i] = prefixSums[i - 1] + sortedCounts[i];
        }
        var pivot = 0;
        for (var i = 0; i < numClusters; i++) {
            if (prefixSums[i] > (1 / Morphology.openClassThresholdFactor) * prefixSums[numClusters - 1]) {
                pivot = sortedCounts[i];
                break;
            }
        }
        var result = [];
        for (var i = 0; i < numClusters; i++) {
            result.push({});
            result[i].open = counts[i] >= pivot;
            result[i].morphemes = [];
            for (var j = 0; j < reverseMorphemeMapping.length; j++) {
                if (clusters[j] == i) {
                    result[i].morphemes.push(reverseMorphemeMapping[j]);
                }
            }
            result[i].morphemes.sort();
            // result[i].prefix = false;
            // if (!result[i].open) {
            //     result[i]
            // }
            // result[i].marginal = false;
        }
        for (var i = 0; i < numClusters; i++) {
            result[i].successors = [];
            for (var j = 0; j < numClusters; j++) {
                if (i == j) {
                    continue;
                }
                var totalIn = 0;
                var totalOut = 0;
                var numIn = {};
                var numOut = {};
                for (var m1 of result[i].morphemes) {
                    for (var m2 of result[j].morphemes) {
                        if (adjacencyMatrix[morphemeMapping[m1]][morphemeMapping[m2]] > 0) {
                            if (!numOut.hasOwnProperty(m1)) {
                                numOut[m1] = 0;
                            }
                            if (!numIn.hasOwnProperty(m2)) {
                                numIn[m2] = 0;
                            }
                            numOut[m1]++;
                            numIn[m2]++;
                        }
                    }
                }
                for (var m of Object.keys(numIn)) {
                    if (numIn[m] > result[i].morphemes.length / Morphology.successorThresholdFactor) {
                        totalIn++;
                    }
                }
                for (var m of Object.keys(numOut)) {
                    if (numOut[m] > result[j].morphemes.length / Morphology.successorThresholdFactor) {
                        totalOut++;
                    }
                }
                if (totalIn > result[j].morphemes.length / Morphology.successorThresholdFactor &&
                    totalOut > result[i].morphemes.length / Morphology.successorThresholdFactor) {
                    result[i].successors.push(j);
                }
            }
        }
        return result;
    },

    inventWords: (numClusters, clusterInfo, initial, final, words, progressCallback) => {
        var result = new Set;
        var numFailures = 0;
        while (result.size < Morphology.numWordsToInvent && numFailures < 10) {
            console.log(numFailures);
            progressCallback(result.size, Morphology.numWordsToInvent);
            var invention = [];
            var state = initial;
            var failed = false;
            while (state != final) {
                invention.push(clusterInfo[state].morphemes[parseInt(Math.random() * clusterInfo[state].morphemes.length)]);
                if (clusterInfo[state].successors.length == 0) {
                    failed = true;
                    break;
                }
                var state = clusterInfo[state].successors[parseInt(Math.random() * clusterInfo[state].successors.length)];
            }
            if (!failed) {
                var invention = invention.slice(1).join('');
                if (!words.has(invention)) {
                    result.add(invention);
                    numFailures = 0;
                } else {
                    numFailures++;
                }
            } else {
                numFailures++;
            }
        }
        return Array.from(result);
    }
};
