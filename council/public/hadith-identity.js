// Exact corpus identity only. These numbers belong to Salsabeel_Hadith.
export const hadithCollections=Object.freeze({
 'Sahih al-Bukhari':Object.freeze({slug:'bukhari',label:'صحيح البخاري'}),
 'Sahih Muslim':Object.freeze({slug:'muslim',label:'صحيح مسلم'}),
 'Jami al-Tirmidhi':Object.freeze({slug:'tirmidhi',label:'جامع الترمذي'}),
 'Sunan Abu Dawud':Object.freeze({slug:'abudawud',label:'سنن أبي داود'}),
 'Sunan al-Nasai':Object.freeze({slug:'nasai',label:'سنن النسائي'}),
 'Sunan Ibn Majah':Object.freeze({slug:'ibnmajah',label:'سنن ابن ماجه'}),
 'Sunan al-Darimi':Object.freeze({slug:'darimi',label:'سنن الدارمي'}),
 'Muwatta Malik':Object.freeze({slug:'malik',label:'موطأ مالك'}),
 'Musnad Ahmad':Object.freeze({slug:'ahmad',label:'مسند أحمد'}),
});
export function localHadithTarget(identity){
 if(!identity||identity.kind!=='hadith'||identity.corpus!=='Salsabeel_Hadith'||identity.numberingScheme!=='barq-local')return null;
 const record=Object.hasOwn(hadithCollections,identity.collectionEn)?hadithCollections[identity.collectionEn]:null;
 if(!record||!Number.isInteger(identity.localNumber)||identity.localNumber<1||identity.localNumber>99999)return null;
 if(identity.collection!=null&&identity.collection!==record.label&&identity.collection!==identity.collectionEn)return null;
 return {slug:record.slug,number:identity.localNumber,scheme:'local',readerPath:`/api/barq/read/hadith/${record.slug}/${identity.localNumber}`};
}
