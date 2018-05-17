Morphology = {
    leadingPunctuation: /^[!"#$%&\'()*+,-./:;<=>?@\[\\\]\^_`{|}~—‘’“”¿¡«»-]*/,
    trailingPunctuation: /[!"#$%&\'()*+,-./:;<=>?@\[\\\]\^_`{|}~—‘’“”¿¡«»-]*$/,
    preferredMorphemeLength: 3,
    numSalientSubstrings: 3000,
    minCommutationStrength: 30,
    minEdgeStrength: 1,
    firstPassSquashingFactor: 50,
    firstPassClusterCount: 50,
    secondPassSquashingFactor: 150,
    secondPassClusterCount: 50,
    edgeThresholdFactor: 5,
    pruningThreshold: 5000,
    openClassThresholdFactor: 100,
    successorThresholdFactor: 8,
    numWordsToInvent: 10000,
    commutationAnomalyFactor: 10,
    trainingSetProportion: 5,
    maxNumPrimaryCommutations: 5000,

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
                    if (wordsWithBoundaries.has(t.replace('_', ''))) {
                        templates[t].add('');
                    }
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
            result.push([commutations[key], m1, m2]);
        }
        result.sort((l, r) => r[0].size - l[0].size);
        return result.slice(0, Morphology.maxNumPrimaryCommutations);
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
                scores[minor] = 0;
            } else {
                // Duplicate
                continue;
            }
            scores[minor] += set.size;
            for (var sub1 of Morphology.getSubstrings(m1)) {
                for (var sub2 of Morphology.getSubstrings(m2)) {
                    if (sub2 < sub1) {
                        [sub1, sub2] = [sub2, sub1];
                    }
                    major = sub1 + ':' + sub2;
                    if (minor != major && m1.replace(sub1, '') == m2.replace(sub2, '')) {
                        nodes.add(major);
                        if (!scores.hasOwnProperty(major)) {
                            scores[major] = 0;
                        }
                        scores[major] += set.size;
                        edges.add([major, minor]);
                    }
                }
            }
        }
        for (var c1 of new Set(nodes)) {
            for (var c2 of new Set(nodes)) {
                var [m1, m2, m3, m4] = c1.split(':').concat(c2.split(':'));
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
            var set = Morphology.removeAnomalies(preResult[c]);
            if (set.size > Morphology.minCommutationStrength) {
                result.push([set, m1, m2]);
            }
        }
        return result;
    },

    removeAnomalies: (commutationProofs) => {
        commutationProofs = Array.from(commutationProofs);
        var distribution = {
            right: [],
            rightMarginal: [],
            left: [],
            leftMarginal: []
        };
        for (var proof of commutationProofs) {
            var pivot = proof.indexOf('_');
            if (pivot == 0) {
                distribution.leftMarginal.push(proof);
            } else if (pivot == proof.length - 1) {
                distribution.rightMarginal.push(proof);
            } else if (pivot < proof.length / 2) {
                distribution.left.push(proof);
            } else {
                distribution.right.push(proof);
            }
        }
        var max = Object.values(distribution).reduce((a, x) => Math.max(a, x.length), 0);
        var sum = Object.values(distribution).reduce((a, x) => a + x.length, 0);
        if (max > sum * (1 - 1 / Morphology.commutationAnomalyFactor)) {
            for (var type of Object.keys(distribution)) {
                if (distribution[type].length == max) {
                    return new Set(distribution[type]);
                }
            }
        }
        return new Set;
    },

    getBigrams: (commutations) => {
        var byWord = {};
        for (var [set, m1, m2] of commutations) {
            for (var t of set) {
                for (var m of [m1, m2]) {
                    var word = t.replace('_', m);
                    if (!byWord.hasOwnProperty(word)) {
                        byWord[word] = new Set;
                    }
                    if (m != '') {
                        byWord[word].add(m);
                    }
                }
            }
        }
        var preResult = {};
        for (var word of Object.keys(byWord)) {
            var morphemes = Array.from(byWord[word]).concat(['⋊', '⋉']);
            var w = '⋊' + word + '⋉';
            morphemes.sort((m1, m2) => w.indexOf(m1) - w.indexOf(m2));
            var last = null;
            var numReversals = 0;
            for (var i = 0; i < morphemes.length; i++) {
                if (numReversals > 5) {
                    break;
                }
                var m = morphemes[i];
                if (!w.startsWith(m)) {
                    m = w.substring(0, w.indexOf(morphemes[i]));
                    i--;
                    numReversals++;
                }
                if (m == '') {
                    break;
                }
                w = w.substring(m.length);
                if (last != null) {
                    key = last + ':' + m;
                    if (!preResult.hasOwnProperty(key)) {
                        preResult[key] = new Set;
                    }
                    preResult[key].add(word);
                }
                last = m;
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
            if (!morphemeMapping.hasOwnProperty(morpheme)) {
                morphemeMapping[morpheme] = k++;
            }
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

    renumberClusters: (clusters, numClusters, morphemeMapping) => {
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
        for (var boundary of ['⋊', '⋉']) {
            var m = morphemeMapping[boundary];
            if (result.filter((c) => c == result[m]).length > 1) {
                result[m] = last++;
            }
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
        var shuffle = (array) => {
            var result = Array.from(array);
            for (var i = array.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                [result[i], result[j]] = [result[j], result[i]];
            }
            return result;
        };
        var invent = (prefix, state, depth, depthLimit) => {
            if (depth > depthLimit) {
                return;
            }
            if (state == final && prefix.length > 0 && !words.has(prefix)) {
                result.add(prefix);
                return;
            }
            progressCallback(result.size, Morphology.numWordsToInvent);
            if (result.size >= Morphology.numWordsToInvent) {
                return;
            }
            for (var newDepthLimit = depth + 1; newDepthLimit <= depthLimit; newDepthLimit++) {
                for (var successor of shuffle(clusterInfo[state].successors)) {
                    for (var morpheme of shuffle(clusterInfo[state].morphemes)) {
                        invent(prefix + morpheme, successor, depth + 1, newDepthLimit);
                    }
                }
            }
        };
        for (var depthLimit = 1; depthLimit <= 5; depthLimit++) {
            for (var next of shuffle(clusterInfo[initial].successors)) {
                invent('', next, 0, depthLimit);
            }
        }
        result = Array.from(result);
        result.sort();
        return result;
    },

    segment: (text, words, clusters, clusterInfo, morphemeMapping, progressCallback) => {
        var run = (suffix, state) => {
            if (suffix == '') {
                return [];
            }
            for (var i = 1; i <= suffix.length; i++) {
                var substring = suffix.substring(0, i);
                if (morphemeMapping.hasOwnProperty(substring)) {
                    var next = clusters[morphemeMapping[substring]];
                    if (clusterInfo[state].successors.includes(next)) {
                        var subResult = run(suffix.substring(substring.length), next);
                        if (subResult !== null) {
                            return [substring].concat(subResult);
                        }
                    }
                }
            }
            return null;
        };
        var result = {};
        var k = 0;
        text = text.replace(/-/g, ' ');
        for (var word of words) {
            progressCallback(k++, words.size);
            result[word] = run(word.substring(1), clusters[morphemeMapping['⋊']]);
            if (result[word] !== null) {
                result[word] = result[word].slice(0, -1);
            }
            try {
                if (result[word] !== null && result[word].length > 1) {
                    text = text.replace(new RegExp('([^\\w\']|^)(' + word.substring(1, word.length - 1) + ')([^\\w\']|$)', 'ig'), '$1' + result[word].join('-') + '$3');
                }
            } catch (error) {
                // Ignore regex errors
            }
        }
        return [result, text];
    }
};
