"use strict";
export const validate = validate20;
export default validate20;
const schema31 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.local/schemas/it-costs-sheet1.schema.json","title":"Invoice Items (Rechnunspositionen)","description":"Schema for the Excel sheet 'IT_Costs_2026'. Each row represents a single invoice line item (DocumentId + LineId). This schema validates the JSON representation after Excel import (array of rows).","type":"array","minItems":1,"items":{"type":"object","additionalProperties":true,"required":["Period","PostingDate","LineId","Amount"],"anyOf":[{"required":["VendorId"]},{"required":["VendorName"]}],"properties":{"FiscalYear":{"type":"integer","minimum":2000,"maximum":2100,"description":"Fiscal year of the posting, e.g. 2026."},"Period":{"type":"string","pattern":"^[0-9]{4}-(0[1-9]|1[0-3])$","description":"Accounting period (month key) in format YYYY-MM, e.g. 2026-10 or 2026-13."},"PostingDate":{"type":"string","format":"date","description":"Posting or service date (ISO date string YYYY-MM-DD) after Excel import."},"VendorName":{"type":"string","minLength":1,"description":"Supplier name. At least VendorName or VendorId must be provided."},"VendorId":{"type":"string","minLength":1,"description":"Stable supplier identifier (preferred over name for grouping), e.g. V002."},"DocumentId":{"type":"string","minLength":1,"description":"Invoice / document identifier. Multiple rows can share the same DocumentId for multi-line invoices."},"LineId":{"type":"integer","minimum":1,"description":"Line number within the document (invoice position). Together with DocumentId forms the line item key."},"CostCenter":{"type":"string","minLength":1,"description":"Cost center or organizational unit charged, e.g. IT-OPS."},"GLAccount":{"type":"string","pattern":"^[0-9]{4,10}$","description":"General ledger account / nominal account (Sachkonto). Often numeric string like 640000."},"Category":{"type":"string","enum":["Hosting","Infrastructure","Licenses","Consulting","Security","Application"],"description":"Primary cost category used for KPI aggregation and drilldown."},"SubCategory":{"type":"string","minLength":1,"description":"Secondary classification within Category (e.g., Server, Subscription, SOC)."},"Service":{"type":"string","minLength":1,"description":"Business/IT service label for analysis, e.g. 'SAP IS-U Betrieb' or 'M365'."},"System":{"type":"string","minLength":1,"description":"System/domain label (e.g., SAP, M365, Security, Cloud, Data, Network, CRM, Integration)."},"RunChangeInnovation":{"type":"string","enum":["Run","Change","Innovation"],"description":"Classification for operating vs change vs innovation spend."},"Amount":{"type":"number","description":"Line amount in Currency. Costs are positive, credits/credit notes are negative."},"Currency":{"type":"string","pattern":"^[A-Z]{3}$","description":"ISO 4217 currency code, e.g. EUR."},"Quantity":{"type":"number","description":"Quantity for unit-based charging (optional). Can be negative for corrections."},"Unit":{"type":"string","minLength":1,"description":"Unit of measure for Quantity, e.g. Hours, Seats, GB, Months, Units."},"UnitPrice":{"type":"number","minimum":0,"description":"Unit price in Currency (optional). Often Amount ≈ Quantity × UnitPrice."},"ContractId":{"type":"string","description":"Contract reference (may be empty). Used for contract coverage KPIs."},"POId":{"type":"string","description":"Purchase order reference (may be empty). Used for procurement traceability."},"IsRecurring":{"type":"string","enum":["Y","N"],"description":"Indicates recurring monthly spend (Y) vs ad-hoc (N)."},"Description":{"type":"string","description":"Free text description of the line item (from invoice/position text)."},"SourceTag":{"type":"string","description":"Test-data tag for scenario control (e.g., RECURRING, ADHOC, PROJECT_SPIKE, ANOMALY_SPIKE, NEW_VENDOR, CONTRACTLESS). Can include '|CREDIT'."}}}};
const pattern4 = new RegExp("^[0-9]{4}-(0[1-9]|1[0-3])$", "u");
const pattern5 = new RegExp("^[0-9]{4,10}$", "u");
const pattern6 = new RegExp("^[A-Z]{3}$", "u");
import { fullFormats } from "ajv-formats/dist/formats.js"; const formats0 = fullFormats.date;
import ucs2length from "ajv/dist/runtime/ucs2length.js"; const func1 = ucs2length;

function validate20(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://example.local/schemas/it-costs-sheet1.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate20.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(Array.isArray(data)){
if(data.length < 1){
const err0 = {instancePath,schemaPath:"#/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
const len0 = data.length;
for(let i0=0; i0<len0; i0++){
let data0 = data[i0];
const _errs3 = errors;
let valid2 = false;
const _errs4 = errors;
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
if(data0.VendorId === undefined){
const err1 = {instancePath:instancePath+"/" + i0,schemaPath:"#/items/anyOf/0/required",keyword:"required",params:{missingProperty: "VendorId"},message:"must have required property '"+"VendorId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
var _valid0 = _errs4 === errors;
valid2 = valid2 || _valid0;
const _errs5 = errors;
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
if(data0.VendorName === undefined){
const err2 = {instancePath:instancePath+"/" + i0,schemaPath:"#/items/anyOf/1/required",keyword:"required",params:{missingProperty: "VendorName"},message:"must have required property '"+"VendorName"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
var _valid0 = _errs5 === errors;
valid2 = valid2 || _valid0;
if(!valid2){
const err3 = {instancePath:instancePath+"/" + i0,schemaPath:"#/items/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
else {
errors = _errs3;
if(vErrors !== null){
if(_errs3){
vErrors.length = _errs3;
}
else {
vErrors = null;
}
}
}
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
if(data0.Period === undefined){
const err4 = {instancePath:instancePath+"/" + i0,schemaPath:"#/items/required",keyword:"required",params:{missingProperty: "Period"},message:"must have required property '"+"Period"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data0.PostingDate === undefined){
const err5 = {instancePath:instancePath+"/" + i0,schemaPath:"#/items/required",keyword:"required",params:{missingProperty: "PostingDate"},message:"must have required property '"+"PostingDate"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data0.LineId === undefined){
const err6 = {instancePath:instancePath+"/" + i0,schemaPath:"#/items/required",keyword:"required",params:{missingProperty: "LineId"},message:"must have required property '"+"LineId"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data0.Amount === undefined){
const err7 = {instancePath:instancePath+"/" + i0,schemaPath:"#/items/required",keyword:"required",params:{missingProperty: "Amount"},message:"must have required property '"+"Amount"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data0.FiscalYear !== undefined){
let data1 = data0.FiscalYear;
if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){
const err8 = {instancePath:instancePath+"/" + i0+"/FiscalYear",schemaPath:"#/items/properties/FiscalYear/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if((typeof data1 == "number") && (isFinite(data1))){
if(data1 > 2100 || isNaN(data1)){
const err9 = {instancePath:instancePath+"/" + i0+"/FiscalYear",schemaPath:"#/items/properties/FiscalYear/maximum",keyword:"maximum",params:{comparison: "<=", limit: 2100},message:"must be <= 2100"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data1 < 2000 || isNaN(data1)){
const err10 = {instancePath:instancePath+"/" + i0+"/FiscalYear",schemaPath:"#/items/properties/FiscalYear/minimum",keyword:"minimum",params:{comparison: ">=", limit: 2000},message:"must be >= 2000"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
if(data0.Period !== undefined){
let data2 = data0.Period;
if(typeof data2 === "string"){
if(!pattern4.test(data2)){
const err11 = {instancePath:instancePath+"/" + i0+"/Period",schemaPath:"#/items/properties/Period/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(0[1-9]|1[0-3])$"},message:"must match pattern \""+"^[0-9]{4}-(0[1-9]|1[0-3])$"+"\""};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/" + i0+"/Period",schemaPath:"#/items/properties/Period/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data0.PostingDate !== undefined){
let data3 = data0.PostingDate;
if(typeof data3 === "string"){
if(!(formats0.validate(data3))){
const err13 = {instancePath:instancePath+"/" + i0+"/PostingDate",schemaPath:"#/items/properties/PostingDate/format",keyword:"format",params:{format: "date"},message:"must match format \""+"date"+"\""};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/" + i0+"/PostingDate",schemaPath:"#/items/properties/PostingDate/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data0.VendorName !== undefined){
let data4 = data0.VendorName;
if(typeof data4 === "string"){
if(func1(data4) < 1){
const err15 = {instancePath:instancePath+"/" + i0+"/VendorName",schemaPath:"#/items/properties/VendorName/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/" + i0+"/VendorName",schemaPath:"#/items/properties/VendorName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data0.VendorId !== undefined){
let data5 = data0.VendorId;
if(typeof data5 === "string"){
if(func1(data5) < 1){
const err17 = {instancePath:instancePath+"/" + i0+"/VendorId",schemaPath:"#/items/properties/VendorId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/" + i0+"/VendorId",schemaPath:"#/items/properties/VendorId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data0.DocumentId !== undefined){
let data6 = data0.DocumentId;
if(typeof data6 === "string"){
if(func1(data6) < 1){
const err19 = {instancePath:instancePath+"/" + i0+"/DocumentId",schemaPath:"#/items/properties/DocumentId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/" + i0+"/DocumentId",schemaPath:"#/items/properties/DocumentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data0.LineId !== undefined){
let data7 = data0.LineId;
if(!(((typeof data7 == "number") && (!(data7 % 1) && !isNaN(data7))) && (isFinite(data7)))){
const err21 = {instancePath:instancePath+"/" + i0+"/LineId",schemaPath:"#/items/properties/LineId/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if((typeof data7 == "number") && (isFinite(data7))){
if(data7 < 1 || isNaN(data7)){
const err22 = {instancePath:instancePath+"/" + i0+"/LineId",schemaPath:"#/items/properties/LineId/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
}
if(data0.CostCenter !== undefined){
let data8 = data0.CostCenter;
if(typeof data8 === "string"){
if(func1(data8) < 1){
const err23 = {instancePath:instancePath+"/" + i0+"/CostCenter",schemaPath:"#/items/properties/CostCenter/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
else {
const err24 = {instancePath:instancePath+"/" + i0+"/CostCenter",schemaPath:"#/items/properties/CostCenter/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data0.GLAccount !== undefined){
let data9 = data0.GLAccount;
if(typeof data9 === "string"){
if(!pattern5.test(data9)){
const err25 = {instancePath:instancePath+"/" + i0+"/GLAccount",schemaPath:"#/items/properties/GLAccount/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4,10}$"},message:"must match pattern \""+"^[0-9]{4,10}$"+"\""};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
else {
const err26 = {instancePath:instancePath+"/" + i0+"/GLAccount",schemaPath:"#/items/properties/GLAccount/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data0.Category !== undefined){
let data10 = data0.Category;
if(typeof data10 !== "string"){
const err27 = {instancePath:instancePath+"/" + i0+"/Category",schemaPath:"#/items/properties/Category/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(!((((((data10 === "Hosting") || (data10 === "Infrastructure")) || (data10 === "Licenses")) || (data10 === "Consulting")) || (data10 === "Security")) || (data10 === "Application"))){
const err28 = {instancePath:instancePath+"/" + i0+"/Category",schemaPath:"#/items/properties/Category/enum",keyword:"enum",params:{allowedValues: schema31.items.properties.Category.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data0.SubCategory !== undefined){
let data11 = data0.SubCategory;
if(typeof data11 === "string"){
if(func1(data11) < 1){
const err29 = {instancePath:instancePath+"/" + i0+"/SubCategory",schemaPath:"#/items/properties/SubCategory/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
else {
const err30 = {instancePath:instancePath+"/" + i0+"/SubCategory",schemaPath:"#/items/properties/SubCategory/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data0.Service !== undefined){
let data12 = data0.Service;
if(typeof data12 === "string"){
if(func1(data12) < 1){
const err31 = {instancePath:instancePath+"/" + i0+"/Service",schemaPath:"#/items/properties/Service/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
else {
const err32 = {instancePath:instancePath+"/" + i0+"/Service",schemaPath:"#/items/properties/Service/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data0.System !== undefined){
let data13 = data0.System;
if(typeof data13 === "string"){
if(func1(data13) < 1){
const err33 = {instancePath:instancePath+"/" + i0+"/System",schemaPath:"#/items/properties/System/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
else {
const err34 = {instancePath:instancePath+"/" + i0+"/System",schemaPath:"#/items/properties/System/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data0.RunChangeInnovation !== undefined){
let data14 = data0.RunChangeInnovation;
if(typeof data14 !== "string"){
const err35 = {instancePath:instancePath+"/" + i0+"/RunChangeInnovation",schemaPath:"#/items/properties/RunChangeInnovation/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if(!(((data14 === "Run") || (data14 === "Change")) || (data14 === "Innovation"))){
const err36 = {instancePath:instancePath+"/" + i0+"/RunChangeInnovation",schemaPath:"#/items/properties/RunChangeInnovation/enum",keyword:"enum",params:{allowedValues: schema31.items.properties.RunChangeInnovation.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data0.Amount !== undefined){
let data15 = data0.Amount;
if(!((typeof data15 == "number") && (isFinite(data15)))){
const err37 = {instancePath:instancePath+"/" + i0+"/Amount",schemaPath:"#/items/properties/Amount/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data0.Currency !== undefined){
let data16 = data0.Currency;
if(typeof data16 === "string"){
if(!pattern6.test(data16)){
const err38 = {instancePath:instancePath+"/" + i0+"/Currency",schemaPath:"#/items/properties/Currency/pattern",keyword:"pattern",params:{pattern: "^[A-Z]{3}$"},message:"must match pattern \""+"^[A-Z]{3}$"+"\""};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
else {
const err39 = {instancePath:instancePath+"/" + i0+"/Currency",schemaPath:"#/items/properties/Currency/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data0.Quantity !== undefined){
let data17 = data0.Quantity;
if(!((typeof data17 == "number") && (isFinite(data17)))){
const err40 = {instancePath:instancePath+"/" + i0+"/Quantity",schemaPath:"#/items/properties/Quantity/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data0.Unit !== undefined){
let data18 = data0.Unit;
if(typeof data18 === "string"){
if(func1(data18) < 1){
const err41 = {instancePath:instancePath+"/" + i0+"/Unit",schemaPath:"#/items/properties/Unit/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
else {
const err42 = {instancePath:instancePath+"/" + i0+"/Unit",schemaPath:"#/items/properties/Unit/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
if(data0.UnitPrice !== undefined){
let data19 = data0.UnitPrice;
if((typeof data19 == "number") && (isFinite(data19))){
if(data19 < 0 || isNaN(data19)){
const err43 = {instancePath:instancePath+"/" + i0+"/UnitPrice",schemaPath:"#/items/properties/UnitPrice/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
else {
const err44 = {instancePath:instancePath+"/" + i0+"/UnitPrice",schemaPath:"#/items/properties/UnitPrice/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
if(data0.ContractId !== undefined){
if(typeof data0.ContractId !== "string"){
const err45 = {instancePath:instancePath+"/" + i0+"/ContractId",schemaPath:"#/items/properties/ContractId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
if(data0.POId !== undefined){
if(typeof data0.POId !== "string"){
const err46 = {instancePath:instancePath+"/" + i0+"/POId",schemaPath:"#/items/properties/POId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data0.IsRecurring !== undefined){
let data22 = data0.IsRecurring;
if(typeof data22 !== "string"){
const err47 = {instancePath:instancePath+"/" + i0+"/IsRecurring",schemaPath:"#/items/properties/IsRecurring/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if(!((data22 === "Y") || (data22 === "N"))){
const err48 = {instancePath:instancePath+"/" + i0+"/IsRecurring",schemaPath:"#/items/properties/IsRecurring/enum",keyword:"enum",params:{allowedValues: schema31.items.properties.IsRecurring.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
if(data0.Description !== undefined){
if(typeof data0.Description !== "string"){
const err49 = {instancePath:instancePath+"/" + i0+"/Description",schemaPath:"#/items/properties/Description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
if(data0.SourceTag !== undefined){
if(typeof data0.SourceTag !== "string"){
const err50 = {instancePath:instancePath+"/" + i0+"/SourceTag",schemaPath:"#/items/properties/SourceTag/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
}
else {
const err51 = {instancePath:instancePath+"/" + i0,schemaPath:"#/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
}
else {
const err52 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
validate20.errors = vErrors;
return errors === 0;
}
validate20.evaluated = {"items":true,"dynamicProps":false,"dynamicItems":false};
