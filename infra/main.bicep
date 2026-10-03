// EnglishTutor on Azure: everything the app needs, on always-free tiers.
//
//   Static Web App  swa-englishtutor                Free plan, frontend + managed Functions API
//   Cosmos DB       cosmos-englishtutor-<suffix>    free tier, account throughput limited to 1000 RU/s
//     database      englishtutor                    1000 RU/s shared by its containers
//     container     progress                        one document per pupil, partition key /id
//
// Deploy into the resource group rg-englishtutor (West Europe); see infra/README.md.
// Secrets are not set here: the API's environment variables are set with the Azure CLI, so that
// redeploying this template never wipes them.

targetScope = 'resourceGroup'

@description('Region of every resource. Static Web Apps Free is available in westeurope.')
param location string = resourceGroup().location

@description('Makes the Cosmos DB account name globally unique.')
param cosmosSuffix string = take(uniqueString(resourceGroup().id), 6)

var appName = 'englishtutor'

resource staticWebApp 'Microsoft.Web/staticSites@2024-11-01' = {
  name: 'swa-${appName}'
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    // Pull-request previews would get the production environment variables, and so the
    // production database. Deploy only from master.
    stagingEnvironmentPolicy: 'Disabled'
    allowConfigFileUpdates: true
  }
}

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2025-04-15' = {
  name: 'cosmos-${appName}-${cosmosSuffix}'
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    // Only one free-tier account is allowed per subscription, and only at creation time.
    enableFreeTier: true
    // The free tier covers 1000 RU/s; the limit makes it impossible to provision (and pay for) more.
    capacity: {
      totalThroughputLimit: 1000
    }
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    // Point-in-time restore for the last 7 days; this tier has no backup storage charge.
    backupPolicy: {
      type: 'Continuous'
      continuousModeProperties: {
        tier: 'Continuous7Days'
      }
    }
    minimalTlsVersion: 'Tls12'
    // The API's key can read and write documents, but not create or delete databases and containers.
    disableKeyBasedMetadataWriteAccess: true
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2025-04-15' = {
  parent: cosmos
  name: appName
  properties: {
    resource: {
      id: appName
    }
    options: {
      throughput: 1000
    }
  }
}

resource progressContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2025-04-15' = {
  parent: database
  name: 'progress'
  properties: {
    resource: {
      id: 'progress'
      partitionKey: {
        paths: [
          '/id'
        ]
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          {
            path: '/*'
          }
        ]
        // The game state is only ever read whole; not indexing it makes every save cheaper.
        excludedPaths: [
          {
            path: '/data/*'
          }
          {
            path: '/"_etag"/?'
          }
        ]
      }
    }
  }
}

output staticWebAppName string = staticWebApp.name
output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'
output cosmosAccountName string = cosmos.name
