# Mechanic's Eye

## Overview

Mechanic's Eye is a mobile-first AI-powered vehicle diagnostics application that allows users to upload audio clips, video files, vibration data, and textual descriptions of vehicle problems to receive instant diagnostic analysis. The app provides likely diagnoses with confidence scores, severity levels, and estimated repair costs.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The application follows a full-stack TypeScript architecture with a React frontend and Express backend, designed primarily for mobile devices with web browser fallback support.

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack Query (React Query) for server state
- **UI Framework**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom automotive color scheme
- **Build Tool**: Vite for development and production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **File Upload**: Multer middleware for handling multipart form data
- **Storage**: In-memory storage implementation with interface for future database integration
- **API Design**: RESTful endpoints with proper error handling

## Key Components

### Data Models
- **Users**: Basic user management with username/password
- **Diagnoses**: Core entity storing vehicle issues, uploaded files, and AI analysis results
- **Schema Validation**: Zod schemas for type-safe data validation

### File Upload System
- Supports audio (MP3, WAV, MP4, M4A) and video (MP4, QuickTime, AVI) files
- 50MB file size limit per upload
- Configurable upload directory with automatic creation
- MIME type validation for security

### Mock Analysis Engine
- Predefined database of common vehicle issues with symptoms
- Confidence scoring system (0-100%)
- Severity classification (Low/Medium/High Priority)
- Cost estimation ranges
- Alternative diagnosis scenarios

### Mobile-First UI
- Responsive design optimized for mobile devices
- Bottom navigation for mobile navigation patterns
- Touch-friendly upload interfaces with multiple input methods
- Progressive analysis feedback with loading states

## Data Flow

1. **User Input Collection**: Multi-modal data capture through tabbed interface
   - Audio recording/upload
   - Video capture/upload
   - Vibration data simulation
   - Textual problem description
   - Vehicle information and timing details

2. **File Processing**: Server-side file validation and storage
   - MIME type checking
   - File size validation
   - Secure file storage in designated upload directory

3. **Analysis Pipeline**: Mock AI analysis system
   - Pattern matching against known issue database
   - Confidence scoring based on input completeness
   - Multiple scenario generation with ranking

4. **Results Presentation**: Structured diagnostic output
   - Primary diagnosis with detailed explanation
   - Alternative scenarios ranked by confidence
   - Actionable recommendations with cost estimates

## External Dependencies

### Core Runtime
- **@neondatabase/serverless**: Database connection layer (prepared for future PostgreSQL integration)
- **drizzle-orm**: Type-safe ORM with PostgreSQL dialect support
- **multer**: Multipart form data handling for file uploads

### UI/UX Libraries
- **@radix-ui/**: Accessible, unstyled UI primitives
- **@tanstack/react-query**: Server state management and caching
- **lucide-react**: Consistent icon library
- **tailwindcss**: Utility-first CSS framework

### Development Tools
- **tsx**: TypeScript execution for development
- **esbuild**: Fast bundling for production builds
- **vite**: Development server with HMR

## Deployment Strategy

### Development Environment
- Hot module replacement via Vite
- TypeScript compilation checking
- Automatic server restart with tsx
- File watching for both client and server code

### Production Build Process
1. Client-side React app built with Vite to `dist/public`
2. Server-side Express app bundled with esbuild to `dist/index.js`
3. Static file serving from built client assets
4. Environment variable configuration for database connections

### Database Preparation
- Drizzle schema defined for PostgreSQL with UUID primary keys
- Migration system ready for schema deployment
- Connection configuration via DATABASE_URL environment variable
- Fallback to in-memory storage for development/testing

The architecture is designed to be scalable and production-ready, with clear separation of concerns and preparation for real AI integration to replace the current mock analysis system.