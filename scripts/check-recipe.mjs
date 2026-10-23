// SPDX-License-Identifier: MIT
import {verifyRecipe} from './recipe.mjs';
const {proton,patches}=await verifyRecipe();
console.log(`Verified Experimental ${proton.proton.commit}, ${patches.patches.length} ordered patches and compatibility source hashes.`);

